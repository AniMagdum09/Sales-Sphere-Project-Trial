import { Fragment, useCallback, useEffect, useState } from 'react'
import ChartCard from '../components/ChartCard'
import DropZone from '../components/DropZone'
import ErrorBanner from '../components/ErrorBanner'
import {
  IconCheckCircle,
  IconChevronRight,
  IconDownload,
  IconRefresh,
  IconShield,
  IconTrash,
  IconUpload,
  IconX,
} from '../components/icons'
import { apiDelete, apiDownload, apiGet, apiPost, apiUpload, useApiData } from '../api'
import { useHasData, useToast } from '../state'
import { formatDateTime, formatNumber } from '../format'

const KINDS = [
  { id: 'auto', label: 'Auto-detect (recommended)' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'invoice_items', label: 'Invoice line items' },
  { id: 'customers', label: 'Customers' },
  { id: 'products', label: 'Products' },
  { id: 'day_end', label: 'Daily summaries' },
]

const TEMPLATE_KINDS = [
  { id: 'invoices', label: 'Invoices' },
  { id: 'invoice_items', label: 'Invoice line items' },
  { id: 'customers', label: 'Customers' },
  { id: 'products', label: 'Products' },
  { id: 'day_end', label: 'Daily summaries' },
]

const BRANCH_OPTIONS = [
  { id: '', label: 'All data has branch column' },
  { id: '01', label: '01 Sports Main' },
  { id: '02', label: '02 Garments 1' },
  { id: '03', label: '03 Garments 2' },
]

const TABLE_LABELS = {
  customers: 'Customers',
  products: 'Products',
  invoices: 'Invoices',
  invoice_items: 'Invoice line items',
  day_end: 'Daily summaries',
}

const STATUS_CLASS = {
  ok: 'badge-green',
  success: 'badge-green',
  completed: 'badge-green',
  partial: 'badge-amber',
  failed: 'badge-red',
  error: 'badge-red',
}

function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

// Tolerant per-table count extraction: upload results use {rows: n} objects,
// the history endpoint sends plain numbers.
function tableCount(info) {
  if (info && typeof info === 'object' && info.rows != null) return info.rows
  const n = Number(info)
  return Number.isFinite(n) ? n : null
}

// Destructive-action modal. When `requireWord` is set, the confirm button
// stays disabled until the user types the exact word.
function ConfirmModal({ open, title, body, note, confirmLabel, requireWord, busy, onConfirm, onClose }) {
  const [word, setWord] = useState('')

  useEffect(() => {
    if (open) setWord('')
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null
  const ready = !requireWord || word.trim() === requireWord

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <IconX size={15} />
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-text">{body}</p>
          {note ? <p className="modal-text muted">{note}</p> : null}
          {requireWord ? (
            <label className="field">
              <span className="field-label">
                Type <span className="confirm-word">{requireWord}</span> to enable the button
              </span>
              <input
                className="input"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder={requireWord}
                autoFocus
                autoComplete="off"
                spellCheck="false"
              />
            </label>
          ) : null}
        </div>
        <div className="modal-foot">
          <div className="modal-foot-spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={!ready || busy}>
            <IconTrash size={14} />
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ImportData() {
  const toast = useToast()
  const { refresh: refreshHasData } = useHasData()
  const [file, setFile] = useState(null)
  const [kind, setKind] = useState('auto')
  const [branch, setBranch] = useState('')
  const [progress, setProgress] = useState(null) // null | 0..100
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [historyTick, setHistoryTick] = useState(0)

  // expandable history rows + destructive actions
  const [expandedRuns, setExpandedRuns] = useState(() => new Set())
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [erasing, setErasing] = useState(false)
  const [eraseOpen, setEraseOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const historyQ = useApiData(() => apiGet('/api/import/history'), [historyTick])

  const upload = async () => {
    if (!file || progress != null) return
    setError(null)
    setResult(null)
    setProgress(0)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', kind)
      if (branch) fd.append('branch', branch)
      const res = await apiUpload('/api/import/upload', fd, { onProgress: setProgress })
      setResult(res || { ok: true })
      setHistoryTick((t) => t + 1)
      // Data may exist now — re-check so Overview/other pages leave onboarding.
      refreshHasData()
      if (res && res.ok === false) {
        toast.error(
          `${formatNumber(res.rows_failed)} row(s) failed — check the error list.`,
          'Import finished with errors'
        )
      } else {
        toast.success(
          `${file.name} imported — ${formatNumber(res && res.rows_read)} rows read.`,
          'Import complete'
        )
      }
    } catch (err) {
      setError(err && err.message ? err.message : 'Upload failed.')
      toast.error(err && err.message ? err.message : 'Upload failed.', 'Import failed')
    } finally {
      setProgress(null)
    }
  }

  const downloadTemplate = useCallback(
    async (templateKind, ext) => {
      try {
        const name = await apiDownload(
          '/api/import/template',
          { kind: templateKind },
          `${templateKind}_template.${ext}`
        )
        toast.success(`Template ready — ${name}`, 'Download started')
      } catch (err) {
        toast.error(err && err.message ? err.message : 'Template download failed.', 'Download error')
      }
    },
    [toast]
  )

  const toggleExpand = (id) =>
    setExpandedRuns((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const confirmDeleteRun = async () => {
    const run = deleteTarget
    if (!run || run.id == null || deleting) return
    setDeleting(true)
    try {
      const res = await apiDelete(`/api/import/runs/${run.id}`)
      const deleted = (res && res.deleted) || {}
      const parts = Object.entries(deleted)
        .filter(([, n]) => Number(n) > 0)
        .map(([t, n]) => `${TABLE_LABELS[t] || t}: ${formatNumber(n)}`)
      toast.success(
        `Run #${run.id} deleted${parts.length > 0 ? ` — ${parts.join(', ')}` : ''}.`,
        'Import deleted'
      )
      setDeleteTarget(null)
      setHistoryTick((t) => t + 1)
      refreshHasData()
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Delete failed.', 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const confirmEraseAll = async () => {
    if (erasing) return
    setErasing(true)
    try {
      const res = await apiPost('/api/import/erase-all')
      const cleared = (res && res.cleared) || []
      toast.success(
        cleared.length > 0 ? `Cleared: ${cleared.join(', ')}.` : 'All data erased.',
        'Database erased'
      )
      setEraseOpen(false)
      setResult(null)
      setHistoryTick((t) => t + 1)
      refreshHasData()
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Erase failed.', 'Erase failed')
    } finally {
      setErasing(false)
    }
  }

  const tables = (result && result.tables) || {}
  const errors = (result && result.errors) || []
  const historyRows = (historyQ.data && historyQ.data.runs) || []

  return (
    <div className="page">
      <div className="import-hero card">
        <div className="import-hero-text">
          <h2 className="import-title">Import your data</h2>
          <p className="import-sub">
            Bring invoices, customers, products or daily summaries into SalesSphere. CSV and Excel
            workbooks are validated row by row — nothing partial is written if a file is malformed.
          </p>
        </div>
        <DropZone file={file} onFile={setFile} disabled={progress != null} />
      </div>

      <div className="card import-controls">
        <div className="import-controls-grid">
          <label className="filter-field">
            <span>Data type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Branch (when file has no branch column)</span>
            <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
              {BRANCH_OPTIONS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-field">
            <span>&nbsp;</span>
            <button
              type="button"
              className="btn btn-primary import-upload-btn"
              onClick={upload}
              disabled={!file || progress != null}
            >
              <IconUpload size={15} />
              {progress != null ? `Uploading ${progress}%` : 'Upload and import'}
            </button>
          </div>
        </div>

        {progress != null && (
          <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
        {file && progress == null && (
          <p className="import-file-note">
            Ready: <strong>{file.name}</strong> ({formatSize(file.size)}) · type “{KINDS.find((k) => k.id === kind)?.label || kind}”
          </p>
        )}

        <div className="template-row">
          <span className="template-row-label">Download templates:</span>
          {TEMPLATE_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className="btn btn-sm"
              onClick={() => downloadTemplate(k.id, 'csv')}
            >
              <IconDownload size={12} />
              {k.label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => downloadTemplate('bulk', 'xlsx')}
          >
            <IconDownload size={12} />
            Bulk workbook (.xlsx)
          </button>
        </div>
      </div>

      {error ? (
        <ErrorBanner title="Import failed" error={error} onRetry={upload} />
      ) : null}

      {result && (
        <section className="card import-result">
          <header className="card-head">
            <div className="card-head-text">
              <h3 className="card-title">
                {result.ok === false ? 'Import finished with errors' : 'Import successful'}
              </h3>
              <p className="card-subtitle">
                Run #{result.run_id != null ? result.run_id : '—'} · {file ? file.name : ''}
              </p>
            </div>
            <div className="card-actions">
              <span className="badge badge-blue">Rows read: {formatNumber(result.rows_read)}</span>
              <span
                className={`badge ${
                  (result.rows_failed || 0) > 0 ? 'badge-red' : 'badge-green'
                }`}
              >
                Failed: {formatNumber(result.rows_failed)}
              </span>
            </div>
          </header>
          <div className="card-body">
            <div className="import-tables">
              {Object.entries(tables).map(([table, info]) => (
                <div key={table} className="import-table-chip">
                  <IconCheckCircle size={15} />
                  <span>{TABLE_LABELS[table] || table}</span>
                  <strong className="num">
                    {formatNumber(tableCount(info))}
                  </strong>
                  <span className="muted">rows</span>
                </div>
              ))}
              {Object.keys(tables).length === 0 && (
                <span className="muted">The server did not report per-table counts.</span>
              )}
            </div>

            {errors.length > 0 && (
              <div className="import-errors">
                <h4 className="section-title">Row errors (first {Math.min(50, errors.length)})</h4>
                <div className="table-wrap import-error-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>Row</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.slice(0, 50).map((e, i) => (
                        <tr key={i}>
                          <td className="num">{e && e.row != null ? e.row : '—'}</td>
                          <td className="import-error-msg">{(e && e.error) || 'Unknown error'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <ChartCard
        title="Import history"
        subtitle="Previous uploads processed by the server — expand a row for its table breakdown"
        actions={
          <button type="button" className="btn btn-sm" onClick={() => setHistoryTick((t) => t + 1)}>
            <IconRefresh size={13} />
            Refresh
          </button>
        }
      >
        {historyQ.error ? (
          <ErrorBanner error={historyQ.error} onRetry={historyQ.retry} />
        ) : historyQ.loading ? (
          <div className="table-skeleton">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-row" style={{ width: `${96 - (i % 4) * 7}%` }} />
            ))}
          </div>
        ) : historyRows.length === 0 ? (
          <p className="muted" style={{ padding: '6px 2px' }}>
            No imports yet — upload a file above and it will appear here.
          </p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 380 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }} aria-label="Expand" />
                  <th>File</th>
                  <th>Types</th>
                  <th>Branch</th>
                  <th className="th-right">Rows OK</th>
                  <th className="th-right">Failed</th>
                  <th>When</th>
                  <th>Status</th>
                  <th style={{ width: 64 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {historyRows.map((run) => {
                  const id = run && run.id
                  const open = id != null && expandedRuns.has(id)
                  const runTables = (run && run.tables) || {}
                  const entries = Object.entries(runTables)
                  return (
                    <Fragment key={id != null ? id : `idx-${run && run.created_at}`}>
                      <tr>
                        <td>
                          {id != null && entries.length > 0 ? (
                            <button
                              type="button"
                              className={`run-expand-btn${open ? ' open' : ''}`}
                              onClick={() => toggleExpand(id)}
                              title={open ? 'Hide table breakdown' : 'Show table breakdown'}
                              aria-expanded={open}
                            >
                              <IconChevronRight size={13} />
                            </button>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td title={run.filename}>
                          <span className="import-file-cell">{run.filename || '—'}</span>
                        </td>
                        <td>{run.kinds || '—'}</td>
                        <td>{run.branch_code || 'All'}</td>
                        <td className="td-right num">{formatNumber(run.rows_ok)}</td>
                        <td className="td-right num">
                          {Number(run.rows_failed) > 0 ? (
                            <span className="text-red">{formatNumber(run.rows_failed)}</span>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td>{formatDateTime(run.created_at)}</td>
                        <td>
                          <span
                            className={`badge ${
                              STATUS_CLASS[String(run.status || '').toLowerCase()] || 'badge-muted'
                            }`}
                          >
                            {run.status || '—'}
                          </span>
                        </td>
                        <td>
                          {id != null ? (
                            <button
                              type="button"
                              className="icon-btn icon-btn-sm row-delete-btn"
                              title="Delete this import and all rows it brought in"
                              aria-label={`Delete import run #${id}`}
                              onClick={() => setDeleteTarget(run)}
                            >
                              <IconTrash size={14} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td className="run-detail-cell" colSpan={9}>
                            <div className="run-detail-inner">
                              <span className="run-detail-label">
                                Tables brought in by run #{id}
                              </span>
                              {entries.length > 0 ? (
                                entries.map(([table, info]) => (
                                  <span key={table} className="run-table-chip">
                                    <IconCheckCircle size={13} />
                                    <span>{TABLE_LABELS[table] || table}</span>
                                    <strong className="num">{formatNumber(tableCount(info))}</strong>
                                    <span className="muted">rows</span>
                                  </span>
                                ))
                              ) : (
                                <span className="muted">No per-table counts recorded for this run.</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      <section className="card danger-zone">
        <header className="card-head">
          <div className="danger-zone-head">
            <span className="danger-zone-icon">
              <IconShield size={16} />
            </span>
            <div>
              <h3 className="danger-zone-title">Danger zone</h3>
              <p className="danger-zone-sub">Irreversible destructive operations</p>
            </div>
          </div>
        </header>
        <div className="danger-zone-body">
          <p className="danger-zone-text">
            <strong>Erase all data</strong> — permanently deletes every imported row (invoices,
            line items, customers, products, daily summaries and purchase history). This cannot be
            undone. Consider exporting your reports first.
          </p>
          <button type="button" className="btn btn-danger" onClick={() => setEraseOpen(true)}>
            <IconTrash size={14} />
            Erase all data
          </button>
        </div>
      </section>

      <ConfirmModal
        open={deleteTarget != null}
        title="Delete this import?"
        body={
          deleteTarget
            ? `Delete run #${deleteTarget.id} (${deleteTarget.filename || 'unknown file'}) and all rows it brought in? The affected tables will be rebuilt from the remaining imports.`
            : ''
        }
        note="This cannot be undone."
        confirmLabel="Delete import"
        busy={deleting}
        onConfirm={confirmDeleteRun}
        onClose={() => {
          if (!deleting) setDeleteTarget(null)
        }}
      />

      <ConfirmModal
        open={eraseOpen}
        title="Erase all data?"
        body="This permanently deletes every imported row from the SalesSphere database — invoices, line items, customers, products, daily summaries and purchase history."
        note="This cannot be undone. Export your reports first if you need a copy."
        confirmLabel="Erase everything"
        requireWord="DELETE"
        busy={erasing}
        onConfirm={confirmEraseAll}
        onClose={() => {
          if (!erasing) setEraseOpen(false)
        }}
      />
    </div>
  )
}
