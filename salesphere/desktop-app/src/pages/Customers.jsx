import { useEffect, useMemo, useState } from 'react'
import ChartCard from '../components/ChartCard'
import DataTable from '../components/DataTable'
import ErrorBanner from '../components/ErrorBanner'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import NoData from '../components/NoData'
import SegmentChip from '../components/SegmentChip'
import { IconX } from '../components/icons'
import { apiGet, useApiData } from '../api'
import { useFilters, useHasData } from '../state'
import { formatCurrency, formatDate, formatNumber } from '../format'

export default function Customers({ refreshToken }) {
  const { apiParams, filters } = useFilters()
  const { hasData } = useHasData()
  const topQ = useApiData(() => apiGet('/api/customers/top', { limit: 15 }), [refreshToken])
  const rfmQ = useApiData(
    () => apiGet('/api/insights/rfm', apiParams()),
    [filters.branch, filters.range, refreshToken]
  )
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState({ state: 'idle' })
  const [detailTick, setDetailTick] = useState(0)
  const [segmentFilter, setSegmentFilter] = useState('All')

  useEffect(() => {
    if (selectedId == null) {
      setDetail({ state: 'idle' })
      return undefined
    }
    let alive = true
    setDetail({ state: 'loading' })
    apiGet(`/api/customers/${selectedId}`)
      .then((d) => {
        if (alive) setDetail({ state: 'done', data: d })
      })
      .catch((e) => {
        if (alive) setDetail({ state: 'error', error: e })
      })
    return () => {
      alive = false
    }
  }, [selectedId, detailTick, refreshToken])

  const rfmSummary = (rfmQ.data && rfmQ.data.summary) || {}
  const rfmRows = (rfmQ.data && rfmQ.data.rows) || []
  const segments = useMemo(
    () => Object.entries(rfmSummary).sort((a, b) => b[1] - a[1]),
    [rfmSummary]
  )
  const filteredRfmRows =
    segmentFilter === 'All' ? rfmRows : rfmRows.filter((r) => r.segment === segmentFilter)

  const rows = (topQ.data && topQ.data.rows) || []
  const d = detail.state === 'done' ? detail.data || {} : {}
  const customer = d.customer || {}
  const summary = d.summary || {}
  const recent = d.recent || []

  const close = () => setSelectedId(null)

  // Fresh-start: no invoices in the DB -> friendly empty state, never bare zeros.
  if (hasData === false) {
    return (
      <NoData
        title="No customers yet"
        message="Import customers and invoices to see segments and purchase behaviour here."
      />
    )
  }

  return (
    <div className="page">
      <ChartCard
        title="Customer segments (RFM)"
        subtitle={
          rfmQ.data && rfmQ.data.summary
            ? 'Recency, frequency and monetary segmentation — click a segment to filter'
            : 'Recency, frequency and monetary segmentation'
        }
      >
        {rfmQ.loading ? (
          <div className="chip-row">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton segment-skeleton" />
            ))}
          </div>
        ) : rfmQ.error ? (
          <ErrorBanner error={rfmQ.error} onRetry={rfmQ.retry} />
        ) : rfmRows.length === 0 ? (
          <EmptyState
            title="No RFM data"
            message="No customer segmentation was returned for the selected range."
          />
        ) : (
          <>
            <div className="chip-row segment-chips">
              <button
                type="button"
                className={`chip segment-chip${segmentFilter === 'All' ? ' active' : ''}`}
                onClick={() => setSegmentFilter('All')}
              >
                All <span className="chip-count num">{rfmRows.length}</span>
              </button>
              {segments.map(([name, count]) => (
                <button
                  key={name}
                  type="button"
                  className={`chip segment-chip${segmentFilter === name ? ' active' : ''}`}
                  onClick={() => setSegmentFilter((prev) => (prev === name ? 'All' : name))}
                >
                  {name} <span className="chip-count num">{count}</span>
                </button>
              ))}
            </div>

            <DataTable
              columns={[
                { key: 'customer_name', header: 'Customer', title: (r) => r.customer_name },
                { key: 'segment', header: 'Segment', width: 140, render: (r) => <SegmentChip segment={r.segment} /> },
                {
                  key: 'recency_days',
                  header: 'Recency (days)',
                  align: 'right',
                  render: (r) =>
                    r.recency_days == null ? '—' : (
                      <span className={Number(r.recency_days) > 120 ? 'text-red' : undefined}>
                        {formatNumber(r.recency_days)}
                      </span>
                    ),
                },
                { key: 'frequency', header: 'Frequency', align: 'right', render: (r) => formatNumber(r.frequency) },
                { key: 'monetary', header: 'Monetary', align: 'right', render: (r) => formatCurrency(r.monetary) },
                {
                  key: 'last_purchase',
                  header: 'Last Purchase',
                  render: (r) => formatDate(r.last_purchase || r.last_purchase_date),
                },
              ]}
              rows={filteredRfmRows}
              keyField="customer_id"
              loading={rfmQ.loading}
              maxHeight={420}
              loadingRows={8}
              emptyTitle={`No customers in ${segmentFilter}`}
              emptyMessage="Try another segment, or widen the date range in the topbar."
            />
          </>
        )}
      </ChartCard>

      <ChartCard title="Top customers" subtitle="Ranked by revenue · click a row for details">
        <DataTable
          columns={[
            {
              key: 'rank',
              header: '#',
              width: 52,
              render: (_row, i) =>
                i < 3 ? (
                  <span className="rank-top num">{i + 1}</span>
                ) : (
                  <span className="num muted">{i + 1}</span>
                ),
            },
            { key: 'customer_name', header: 'Customer', title: (r) => r.customer_name },
            { key: 'orders', header: 'Orders', align: 'right', render: (r) => formatNumber(r.orders) },
            { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatCurrency(r.revenue) },
            { key: 'last_purchase', header: 'Last Purchase', render: (r) => formatDate(r.last_purchase) },
          ]}
          rows={rows}
          keyField="customer_id"
          loading={topQ.loading}
          onRowClick={(row) => setSelectedId(row.customer_id)}
          selectedKey={selectedId}
          maxHeight={560}
          loadingRows={8}
          emptyTitle="No customers yet"
          emptyMessage="The top-customers endpoint returned no rows."
        />
      </ChartCard>

      {selectedId != null && (
        <div
          className="drawer-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <aside className="drawer">
            <header className="drawer-head">
              <div>
                <h3 className="drawer-title">
                  {detail.state === 'done'
                    ? customer.customer_name || `Customer #${selectedId}`
                    : 'Customer details'}
                </h3>
                {detail.state === 'done' && (
                  <p className="drawer-sub">
                    {[customer.city, customer.phone].filter(Boolean).join(' · ') || '—'}
                    {customer.credit_limit != null
                      ? ` · Credit limit ${formatCurrency(customer.credit_limit)}`
                      : ''}
                  </p>
                )}
              </div>
              <button type="button" className="icon-btn" title="Close panel" onClick={close}>
                <IconX size={16} />
              </button>
            </header>

            <div className="drawer-body">
              {detail.state === 'loading' ? (
                <div className="page-loading">
                  <LoadingSpinner label="Loading customer…" />
                </div>
              ) : detail.state === 'error' ? (
                <ErrorBanner
                  title="Could not load customer"
                  error={detail.error}
                  onRetry={() => setDetailTick((t) => t + 1)}
                />
              ) : (
                <>
                  <div className="detail-stats">
                    <div className="detail-stat">
                      <span className="stat-label">Orders</span>
                      <strong className="num">{formatNumber(summary.orders)}</strong>
                    </div>
                    <div className="detail-stat">
                      <span className="stat-label">Revenue</span>
                      <strong className="num">{formatCurrency(summary.revenue)}</strong>
                    </div>
                    <div className="detail-stat">
                      <span className="stat-label">Avg Bill</span>
                      <strong className="num">{formatCurrency(summary.avg_bill)}</strong>
                    </div>
                    <div className="detail-stat">
                      <span className="stat-label">First Purchase</span>
                      <strong>{formatDate(summary.first_purchase)}</strong>
                    </div>
                    <div className="detail-stat">
                      <span className="stat-label">Last Purchase</span>
                      <strong>{formatDate(summary.last_purchase)}</strong>
                    </div>
                  </div>

                  <div>
                    <h4 className="section-title">Recent purchases</h4>
                    {recent.length === 0 ? (
                      <EmptyState title="No purchases" message="No bills are recorded for this customer." />
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Bill No</th>
                              <th>Date</th>
                              <th className="th-right">Amount</th>
                              <th className="th-right">Items</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recent.map((r, i) => (
                              <tr key={`${r.bill_no || 'bill'}-${i}`}>
                                <td className="mono">{r.bill_no || '—'}</td>
                                <td>{formatDate(r.date)}</td>
                                <td className="td-right num">{formatCurrency(r.amount)}</td>
                                <td className="td-right num">
                                  {r.items == null ? '—' : formatNumber(r.items)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
