import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import StatCard from '../components/StatCard'
import ChartCard, { ChartTooltip, useAxisTick } from '../components/ChartCard'
import DataTable from '../components/DataTable'
import ErrorBanner from '../components/ErrorBanner'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import NoData from '../components/NoData'
import { IconDownload } from '../components/icons'
import { apiDownload, apiGet, useApiData } from '../api'
import { useChartTheme, useFilters, useHasData, useToast } from '../state'
import {
  formatLakhCompact,
  formatCurrency,
  formatDate,
  formatDayShort,
  formatMonth,
  formatMonthShort,
  formatNumber,
  formatQty,
  truncate,
} from '../format'

const QUICK_RANGES = [
  { id: 'all', label: 'All', days: null },
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
]

function isoDaysAgo(days) {
  const d = new Date()
  if (days) d.setDate(d.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function Sales({ refreshToken }) {
  const ct = useChartTheme()
  const axisTick = useAxisTick()
  const { apiParams, filters } = useFilters()
  const { hasData } = useHasData()
  const toast = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [quick, setQuick] = useState('all')
  const [granularity, setGranularity] = useState('month')
  const [exporting, setExporting] = useState(false)

  const applyQuick = (q) => {
    setQuick(q.id)
    if (q.days == null) {
      setFrom('')
      setTo('')
    } else {
      setFrom(isoDaysAgo(q.days))
      setTo(isoDaysAgo(0))
    }
  }

  // Local from/to refine the global range (empty = use global range as-is).
  const range = { ...(from ? { from } : {}), ...(to ? { to } : {}) }

  const trendQ = useApiData(
    () => apiGet('/api/sales/trends', apiParams({ granularity, ...range })),
    [filters.branch, filters.range, from, to, granularity, refreshToken]
  )
  const mainQ = useApiData(
    () =>
      Promise.all([
        apiGet('/api/sales/summary', apiParams(range)),
        apiGet('/api/sales/by-product', apiParams({ ...range, limit: 10 })),
        apiGet('/api/sales/by-customer', apiParams({ ...range, limit: 10 })),
        apiGet('/api/insights/profit', apiParams(range)),
      ]),
    [filters.branch, filters.range, from, to, refreshToken]
  )

  const summary = (mainQ.data && mainQ.data[0]) || {}
  const productRows = (mainQ.data && mainQ.data[1] && mainQ.data[1].rows) || []
  const customerRows = (mainQ.data && mainQ.data[2] && mainQ.data[2].rows) || []
  const profitRows = (mainQ.data && mainQ.data[3] && mainQ.data[3].top_products) || []
  const trendPoints = (trendQ.data && trendQ.data.points) || []

  // Merge profit (cost / margin) into the top-product rows by item_code.
  const profitByCode = useMemo(() => {
    const map = new Map()
    profitRows.forEach((r) => map.set(String(r.item_code), r))
    return map
  }, [profitRows])

  const handleExport = async () => {
    setExporting(true)
    try {
      const name = await apiDownload(
        '/api/export/report.csv',
        apiParams({ ...range, kind: 'product_sales' }),
        'product_sales.csv'
      )
      toast.success(`Export ready — ${name}`, 'Download started')
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Export failed', 'Export error')
    } finally {
      setExporting(false)
    }
  }

  const miniStats = [
    { label: 'Revenue', value: formatCurrency(summary.revenue) },
    { label: 'Invoices', value: formatNumber(summary.invoices) },
    { label: 'Items Sold', value: formatQty(summary.items_sold) },
    { label: 'Avg Bill', value: formatCurrency(summary.avg_bill) },
    { label: 'Discounts Given', value: formatCurrency(summary.discount_total) },
  ]

  const productColumns = [
    { key: 'item_code', header: 'Code', width: 110, render: (r) => <span className="mono">{r.item_code || '—'}</span> },
    { key: 'item_name', header: 'Product', title: (r) => r.item_name },
    { key: 'qty', header: 'Qty Sold', align: 'right', render: (r) => formatQty(r.qty) },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatCurrency(r.revenue) },
    {
      key: 'profit',
      header: 'Profit',
      align: 'right',
      render: (r) => {
        const pr = profitByCode.get(String(r.item_code))
        return pr && pr.profit != null ? (
          <span className="text-green num">{formatCurrency(pr.profit)}</span>
        ) : (
          '—'
        )
      },
    },
    {
      key: 'margin_pct',
      header: 'Margin %',
      align: 'right',
      render: (r) => {
        const pr = profitByCode.get(String(r.item_code))
        return pr && pr.margin_pct != null ? `${formatNumber(pr.margin_pct, 1)}%` : '—'
      },
    },
    { key: 'orders', header: 'Orders', align: 'right', render: (r) => formatNumber(r.orders) },
    { key: 'last_sold', header: 'Last Sold', render: (r) => formatDate(r.last_sold) },
  ]

  const customerColumns = [
    {
      key: 'rank',
      header: '#',
      width: 48,
      render: (_row, i) => (i < 3 ? <span className="rank-top num">{i + 1}</span> : <span className="num muted">{i + 1}</span>),
    },
    { key: 'customer_name', header: 'Customer', title: (r) => r.customer_name },
    { key: 'orders', header: 'Orders', align: 'right', render: (r) => formatNumber(r.orders) },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatCurrency(r.revenue) },
    { key: 'last_purchase', header: 'Last Purchase', render: (r) => formatDate(r.last_purchase) },
  ]

  // Fresh-start: no invoices in the DB -> friendly empty state, never bare zeros.
  if (hasData === false) {
    return (
      <NoData
        title="No sales data yet"
        message="Import your billing data to see revenue trends, top products and customers here."
      />
    )
  }

  return (
    <div className="page">
      <div className="card filter-bar">
        <label className="filter-field filter-field-row">
          <span>From</span>
          <input
            type="date"
            className="input"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setQuick('')
            }}
          />
        </label>
        <label className="filter-field filter-field-row">
          <span>To</span>
          <input
            type="date"
            className="input"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setQuick('')
            }}
          />
        </label>
        <div className="seg" role="group" aria-label="Quick range">
          {QUICK_RANGES.map((q) => (
            <button key={q.id} type="button" className={quick === q.id ? 'active' : ''} onClick={() => applyQuick(q)}>
              {q.label}
            </button>
          ))}
        </div>
        <span className="filter-note">Refines the topbar range — leave empty to use it as-is</span>
        <button type="button" className="btn btn-ghost" onClick={handleExport} disabled={exporting}>
          <IconDownload size={14} />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {mainQ.error ? <ErrorBanner error={mainQ.error} onRetry={mainQ.retry} /> : null}

      {mainQ.loading ? (
        <div className="kpi-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card stat-card">
              <div className="skeleton skeleton-row" style={{ width: '55%' }} />
              <div className="skeleton stat-skeleton-value" />
            </div>
          ))}
        </div>
      ) : (
        <div className="kpi-grid kpi-5">
          {miniStats.map((s, i) => (
            <StatCard key={s.label} size="sm" {...s} index={i} />
          ))}
        </div>
      )}

      <ChartCard
        title="Revenue trend"
        subtitle={granularity === 'month' ? 'Revenue per month' : 'Revenue per day'}
        actions={
          <div className="seg">
            <button
              type="button"
              className={granularity === 'day' ? 'active' : ''}
              onClick={() => setGranularity('day')}
            >
              Day
            </button>
            <button
              type="button"
              className={granularity === 'month' ? 'active' : ''}
              onClick={() => setGranularity('month')}
            >
              Month
            </button>
          </div>
        }
        bodyStyle={{ height: 280 }}
      >
        {trendQ.loading ? (
          <div className="chart-loading">
            <LoadingSpinner label="Loading trend…" />
          </div>
        ) : trendQ.error ? (
          <ErrorBanner error={trendQ.error} onRetry={trendQ.retry} />
        ) : trendPoints.length === 0 ? (
          <EmptyState
            title="No data in range"
            message="No sales were recorded for the selected range and granularity."
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendPoints} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ct.accent} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={ct.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={ct.grid} vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={granularity === 'month' ? formatMonthShort : formatDayShort}
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: ct.grid }}
                minTickGap={30}
              />
              <YAxis
                tickFormatter={formatLakhCompact}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={62}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={granularity === 'month' ? formatMonth : formatDate}
                    formatter={(v) => formatCurrency(v)}
                  />
                }
                cursor={{ stroke: ct.cursor, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke={ct.accent}
                strokeWidth={2}
                fill="url(#salesRevGrad)"
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid-1-1">
        <ChartCard title="Top products" subtitle="By revenue in range" bodyStyle={{ height: 320 }}>
          {mainQ.loading ? (
            <div className="chart-loading">
              <LoadingSpinner label="Loading products…" />
            </div>
          ) : productRows.length === 0 ? (
            <EmptyState title="No product sales" message="No products were sold in the selected range." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productRows} layout="vertical" margin={{ top: 4, right: 78, left: 0, bottom: 4 }}>
                <XAxis type="number" hide domain={[0, (max) => Math.ceil(max * 1.18)]} />
                <YAxis
                  type="category"
                  dataKey="item_name"
                  tickFormatter={(v) => truncate(v, 18)}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={140}
                />
                <Tooltip
                  cursor={{ fill: ct.hoverFill }}
                  content={<ChartTooltip formatter={(v) => formatCurrency(v)} />}
                />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill={ct.accent}
                  radius={[0, 6, 6, 0]}
                  barSize={14}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="revenue"
                    position="right"
                    formatter={formatLakhCompact}
                    fill={ct.text}
                    fontSize={11.5}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top customers" subtitle="By revenue in range">
          <DataTable
            columns={customerColumns}
            rows={customerRows}
            keyField="customer_id"
            loading={mainQ.loading}
            maxHeight={320}
            emptyTitle="No customer sales"
            emptyMessage="No customers purchased in the selected range."
          />
        </ChartCard>
      </div>

      <ChartCard title="Top products — detail" subtitle="Best sellers in the selected range, with profit merge">
        <DataTable
          columns={productColumns}
          rows={productRows}
          keyField="item_code"
          loading={mainQ.loading}
          maxHeight={420}
          emptyTitle="No product sales"
          emptyMessage="No products were sold in the selected range."
          loadingRows={8}
        />
      </ChartCard>
    </div>
  )
}
