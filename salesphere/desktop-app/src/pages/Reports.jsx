import { useEffect, useMemo, useState } from 'react'
import DataTable from '../components/DataTable'
import ErrorBanner from '../components/ErrorBanner'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import NoData from '../components/NoData'
import { IconDownload, IconFileText, IconPrinter } from '../components/icons'
import { apiDownload, apiGetText } from '../api'
import { useFilters, useHasData, rangeLabel } from '../state'
import { formatNumber } from '../format'

const REPORTS = [
  {
    kind: 'sales_summary',
    title: 'Sales summary',
    description: 'Headline sales totals for the selected range: revenue, invoices, items sold, average bill and discounts.',
  },
  {
    kind: 'product_sales',
    title: 'Product sales',
    description: 'Per-product sales: quantity sold, revenue, order count and last-sold date.',
  },
  {
    kind: 'customer_sales',
    title: 'Customer sales',
    description: 'Per-customer purchase totals: orders, revenue and last purchase date.',
  },
  {
    kind: 'inventory',
    title: 'Inventory & stock',
    description: 'Current stock position per item: purchased, sold, net quantity and stock value.',
  },
  {
    kind: 'dead_stock',
    title: 'Dead stock',
    description: 'Items with no recent sales: days idle, last sold date and quantity on hand.',
  },
  {
    kind: 'reorder',
    title: 'Reorder suggestions',
    description: 'Recommended reorder quantities based on sales velocity and days of cover remaining.',
  },
  {
    kind: 'profit',
    title: 'Profit by product',
    description: 'Product-level profitability: revenue, cost, gross profit and margin percentage.',
  },
]

// Minimal RFC-4180-ish CSV parser (handles quoted fields, CRLF, embedded commas).
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}

function looksNumeric(value) {
  return value !== '' && !Number.isNaN(Number(value))
}

export default function Reports() {
  const { apiParams, filters } = useFilters()
  const { hasData } = useHasData()
  const [selectedKind, setSelectedKind] = useState('sales_summary')
  const [preview, setPreview] = useState({ state: 'idle' })
  const [downloading, setDownloading] = useState(false)
  const [retryTick, setRetryTick] = useState(0)

  const selected = REPORTS.find((r) => r.kind === selectedKind) || REPORTS[0]

  useEffect(() => {
    let alive = true
    setPreview({ state: 'loading' })
    apiGetText('/api/export/report.csv', apiParams({ kind: selectedKind }))
      .then((text) => {
        if (!alive) return
        const rows = parseCsv(String(text || ''))
        const header = rows.length > 0 ? rows[0] : []
        const body = rows.slice(1, 51).map((r, i) => {
          const obj = { __row: i }
          header.forEach((h, idx) => {
            obj[h] = r[idx] != null ? r[idx] : ''
          })
          return obj
        })
        setPreview({ state: 'done', header, body, totalRows: rows.length - 1 })
      })
      .catch((err) => {
        if (alive) setPreview({ state: 'error', error: err })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKind, filters.branch, filters.range, retryTick])

  const columns = useMemo(() => {
    if (preview.state !== 'done') return []
    return preview.header.map((h) => ({
      key: h,
      header: h.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      align: looksNumeric(preview.body[0] && preview.body[0][h]) ? 'right' : undefined,
      render: (r) => {
        const v = r[h]
        if (v == null || v === '') return '—'
        const n = Number(v)
        return looksNumeric(v) && Number.isFinite(n)
          ? formatNumber(n, n % 1 === 0 ? 0 : 2)
          : String(v)
      },
    }))
  }, [preview])

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const name = await apiDownload(
        '/api/export/report.csv',
        apiParams({ kind: selectedKind }),
        `${selectedKind}.csv`
      )
      setPreview((p) => ({ ...p, downloaded: name }))
    } catch (err) {
      setPreview((p) => ({ ...p, downloadError: err }))
    } finally {
      setDownloading(false)
    }
  }

  // Fresh-start: no invoices in the DB -> friendly empty state, never bare zeros.
  if (hasData === false) {
    return (
      <NoData
        title="No data to report on"
        message="Import your billing data to generate and download reports."
      />
    )
  }

  return (
    <div className="page">
      <div className="report-grid">
        {REPORTS.map((r) => (
          <button
            key={r.kind}
            type="button"
            className={`report-card${r.kind === selectedKind ? ' selected' : ''}`}
            onClick={() => setSelectedKind(r.kind)}
          >
            <span className="report-card-icon">
              <IconFileText size={16} />
            </span>
            <span className="report-card-name">{r.title}</span>
          </button>
        ))}
      </div>

      <section className="card report-detail">
        <header className="card-head report-detail-head">
          <div className="card-head-text">
            <h3 className="card-title">{selected.title}</h3>
            <p className="card-subtitle">{selected.description}</p>
          </div>
          <div className="card-actions report-actions">
            <span className="range-display" title="Range set in the topbar">
              {rangeLabel(filters.range)}
              {filters.branch !== 'all' ? ` · Branch ${filters.branch}` : ' · All branches'}
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
              <IconPrinter size={14} />
              Print
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={downloading}
            >
              <IconDownload size={14} />
              {downloading ? 'Preparing…' : 'Download CSV'}
            </button>
          </div>
        </header>

        <div className="card-body">
          {preview.state === 'loading' ? (
            <div className="table-skeleton">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton skeleton-row" style={{ width: `${96 - (i % 4) * 7}%` }} />
              ))}
            </div>
          ) : preview.state === 'error' ? (
            <ErrorBanner
              title="Could not load preview"
              error={preview.error}
              onRetry={() => setRetryTick((t) => t + 1)}
            />
          ) : (
            <>
              {preview.downloadError ? (
                <ErrorBanner
                  title="Download failed"
                  error={preview.downloadError}
                  onRetry={handleDownload}
                />
              ) : null}
              {preview.body && preview.body.length === 0 ? (
                <EmptyState
                  title="No rows in range"
                  message="The report generated no rows for the selected filters."
                />
              ) : (
                <>
                  <DataTable
                    columns={columns}
                    rows={preview.body || []}
                    keyField="__row"
                    maxHeight={480}
                    loadingRows={8}
                    emptyTitle="No rows in range"
                    emptyMessage="The report generated no rows for the selected filters."
                  />
                  <p className="report-note">
                    {preview.state === 'done'
                      ? `Preview: first ${Math.min(50, preview.totalRows ?? 0)} of ${formatNumber(
                          preview.totalRows
                        )} rows · download for the full export.`
                      : ''}
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
