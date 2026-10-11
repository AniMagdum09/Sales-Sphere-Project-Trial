import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import StatCard from '../components/StatCard'
import ChartCard, { ChartTooltip, MiniLegend, useAxisTick } from '../components/ChartCard'
import DataTable from '../components/DataTable'
import ErrorBanner from '../components/ErrorBanner'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import NoData from '../components/NoData'
import {
  IconActivity,
  IconArrowDown,
  IconFileText,
  IconLayers,
  IconStore,
  IconTruck,
  IconTrending,
  IconUsers,
  IconWallet,
} from '../components/icons'
import { apiGet, useApiData } from '../api'
import { useChartTheme, useFilters, useHasData } from '../state'
import {
  formatLakhCompact,
  formatCurrency,
  formatDate,
  formatMonth,
  formatMonthShort,
  formatNumber,
  formatPercent,
  formatQty,
  truncate,
} from '../format'

const BRAND_PALETTE_EXTRA = ['#6366F1', '#14B8A6', '#94A3B8']

// Generic client-side sortable table: click a header to toggle asc/desc.
function SortableTable({ columns, rows, keyField, initialSort, maxHeight, loading, loadingRows, emptyTitle, emptyMessage }) {
  const [sort, setSort] = useState(
    initialSort || { key: columns[0] && columns[0].key, dir: 'desc' }
  )

  const sortedRows = useMemo(() => {
    if (!rows || rows.length === 0) return []
    const col = columns.find((c) => c.key === sort.key)
    const mul = sort.dir === 'asc' ? 1 : -1
    const val = (row) => (col && col.sortValue ? col.sortValue(row) : row[sort.key])
    return [...rows].sort((a, b) => {
      const av = val(a)
      const bv = val(b)
      if (av == null || av === '') return 1 // nulls always sink to the bottom
      if (bv == null || bv === '') return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul
      return String(av).localeCompare(String(bv)) * mul
    })
  }, [rows, sort, columns])

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))

  if (loading) {
    return (
      <div className="table-skeleton" style={maxHeight ? { maxHeight, overflow: 'hidden' } : undefined}>
        {Array.from({ length: loadingRows || 6 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-row" style={{ width: `${96 - (i % 4) * 7}%` }} />
        ))}
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />
  }

  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.align === 'right' ? 'th-right' : undefined} style={col.width ? { width: col.width } : undefined}>
                <button
                  type="button"
                  className={`th-sort${sort.key === col.key ? ' active' : ''}${sort.key === col.key && sort.dir === 'asc' ? ' sort-asc' : ''}`}
                  onClick={() => toggleSort(col.key)}
                  title={`Sort by ${col.header}`}
                >
                  {col.header}
                  <span className="sort-arrow">
                    <IconArrowDown size={11} />
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => (
            <tr key={row[keyField] != null ? row[keyField] : index}>
              {columns.map((col) => (
                <td key={col.key} className={col.align === 'right' ? 'td-right num' : undefined}>
                  {col.render ? col.render(row, index) : row[col.key] == null ? '—' : String(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ITEM_COLUMNS = [
  {
    key: 'item_name',
    header: 'Item',
    render: (r) => (
      <div className="item-name-cell">
        <strong title={r.item_name}>{r.item_name || '—'}</strong>
        {r.item_code ? <span className="mono">{r.item_code}</span> : null}
      </div>
    ),
  },
  {
    key: 'category',
    header: 'Category / Brand',
    render: (r) => {
      const text = [r.category, r.brand].filter(Boolean).join(' · ')
      return text ? <span title={text}>{text}</span> : <span className="muted">—</span>
    },
  },
  { key: 'qty_sold', header: 'Qty sold', align: 'right', render: (r) => formatQty(r.qty_sold) },
  {
    key: 'revenue_est',
    header: 'Revenue est.',
    align: 'right',
    render: (r) => formatCurrency(r.revenue_est),
  },
  { key: 'cost_est', header: 'Cost est.', align: 'right', render: (r) => formatCurrency(r.cost_est) },
  {
    key: 'profit_est',
    header: 'Profit est.',
    align: 'right',
    render: (r) => {
      const v = Number(r.profit_est)
      if (!Number.isFinite(v)) return <span className="muted">—</span>
      return (
        <span className={v >= 0 ? 'text-green' : 'text-red'}>{formatCurrency(v)}</span>
      )
    },
  },
  {
    key: 'stock_qty',
    header: 'Stock',
    align: 'right',
    render: (r) => (r.stock_qty == null ? <span className="muted">—</span> : formatQty(r.stock_qty)),
  },
  {
    key: 'last_sold',
    header: 'Last sold',
    render: (r) => (r.last_sold ? formatDate(r.last_sold) : <span className="muted">—</span>),
  },
]

export default function Insights({ refreshToken }) {
  const ct = useChartTheme()
  const axisTick = useAxisTick()
  const { apiParams, filters } = useFilters()
  const { hasData } = useHasData()
  const [brandDimension, setBrandDimension] = useState('brand')

  const profitQ = useApiData(
    () => apiGet('/api/insights/profit', apiParams()),
    [filters.branch, filters.range, refreshToken]
  )
  const forecastQ = useApiData(
    () => apiGet('/api/insights/forecast', { periods: 6 }),
    [refreshToken]
  )
  const categoryQ = useApiData(
    () => apiGet('/api/insights/category-sales', apiParams()),
    [filters.branch, filters.range, refreshToken]
  )
  const hourlyQ = useApiData(
    () => apiGet('/api/insights/hourly', apiParams()),
    [filters.branch, filters.range, refreshToken]
  )
  const trendsQ = useApiData(
    () => apiGet('/api/sales/trends', apiParams({ granularity: 'month' })),
    [filters.branch, filters.range, refreshToken]
  )
  const purchasesQ = useApiData(
    () => apiGet('/api/insights/purchases', apiParams()),
    [filters.branch, filters.range, refreshToken]
  )
  const itemPerfQ = useApiData(
    () => apiGet('/api/insights/item-performance', { limit: 25 }),
    [refreshToken]
  )
  const brandQ = useApiData(
    () => apiGet('/api/insights/brand-mix', { dimension: brandDimension }),
    [brandDimension, refreshToken]
  )

  const p = profitQ.data || {}
  const pSummary = p.summary || {}
  const byBranch = p.by_branch || []
  const topProducts = p.top_products || []

  // --- Purchases analysis ----------------------------------------------------
  const purchasesData = purchasesQ.data
  const purchasesActive = Boolean(purchasesData && purchasesData.has_data)
  const purSummary = (purchasesData && purchasesData.summary) || {}
  const purMonthly = (purchasesData && purchasesData.monthly) || []
  const topSuppliers = (purchasesData && purchasesData.top_suppliers) || []

  const purchasesStats = [
    {
      label: 'Total Purchases',
      numeric: { value: purSummary.total, format: formatCurrency },
      icon: <IconTruck size={15} />,
      accent: ct.amber,
    },
    {
      label: 'Purchase Bills',
      numeric: { value: purSummary.bills, format: formatNumber },
      icon: <IconFileText size={15} />,
      accent: ct.blue,
    },
    {
      label: 'Suppliers',
      numeric: { value: purSummary.suppliers, format: formatNumber },
      icon: <IconUsers size={15} />,
      accent: ct.violet,
    },
    {
      label: 'Top Supplier',
      value: purSummary.top_supplier ? truncate(purSummary.top_supplier, 20) : '—',
      title: purSummary.top_supplier || undefined,
      icon: <IconStore size={15} />,
      accent: ct.accent,
      sub: purSummary.top_supplier ? 'Highest purchase value' : null,
    },
  ]

  // --- Item performance --------------------------------------------------------
  const itemRows = (itemPerfQ.data && itemPerfQ.data.rows) || []
  const itemBasis = itemPerfQ.data && itemPerfQ.data.basis

  // --- Brand mix ----------------------------------------------------------------
  const brandRows = (brandQ.data && brandQ.data.rows) || []
  const brandDonut = useMemo(() => {
    const sorted = [...brandRows].sort(
      (a, b) => (Number(b.revenue_est) || 0) - (Number(a.revenue_est) || 0)
    )
    const top = sorted.slice(0, 8).map((r) => ({ name: r.name || '—', value: Number(r.revenue_est) || 0 }))
    const rest = sorted.slice(8)
    if (rest.length > 0) {
      top.push({ name: 'Other', value: rest.reduce((acc, r) => acc + (Number(r.revenue_est) || 0), 0) })
    }
    return top.filter((d) => d.value > 0)
  }, [brandRows])
  const brandTotal = brandDonut.reduce((acc, d) => acc + d.value, 0)
  const brandColors = [...ct.series, ...BRAND_PALETTE_EXTRA]

  // --- Demand forecast data: history + projected line + band ----------------
  const forecastData = useMemo(() => {
    const fc = forecastQ.data
    if (!fc || !Array.isArray(fc.history)) return []
    const rows = fc.history.map((h) => ({
      date: h.date,
      actual: Number(h.revenue) || 0,
    }))
    if (rows.length > 0 && Array.isArray(fc.forecast) && fc.forecast.length > 0) {
      rows[rows.length - 1].projected = rows[rows.length - 1].actual
    }
    ;(fc.forecast || []).forEach((f) => {
      const lower = Number(f.lower)
      const upper = Number(f.upper)
      rows.push({
        date: f.date,
        projected: Number(f.revenue) || 0,
        bandBase: Number.isFinite(lower) ? lower : undefined,
        bandSpan:
          Number.isFinite(upper) && Number.isFinite(lower) ? Math.max(0, upper - lower) : undefined,
      })
    })
    return rows
  }, [forecastQ.data])

  // --- Hourly traffic (invoices + revenue) -----------------------------------
  const hourlyData = useMemo(() => {
    const map = new Map()
    ;((hourlyQ.data && hourlyQ.data.rows) || []).forEach((r) => {
      map.set(Number(r.hour), { revenue: Number(r.revenue) || 0, invoices: Number(r.invoices) || 0 })
    })
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      revenue: (map.get(h) || {}).revenue || 0,
      invoices: (map.get(h) || {}).invoices || 0,
    }))
  }, [hourlyQ.data])

  // --- MoM growth table -------------------------------------------------------
  const growthRows = useMemo(() => {
    const pts = (trendsQ.data && trendsQ.data.points) || []
    return pts.map((pt, i) => {
      const prev = i > 0 ? pts[i - 1] : null
      const prevRev = prev ? Number(prev.revenue) : null
      const rev = Number(pt.revenue) || 0
      const growth =
        prevRev != null && Number.isFinite(prevRev) && prevRev !== 0
          ? ((rev - prevRev) / Math.abs(prevRev)) * 100
          : null
      return {
        month: pt.date,
        revenue: rev,
        invoices: pt.invoices,
        growth,
      }
    })
  }, [trendsQ.data])

  const profitStats = [
    {
      label: 'Revenue',
      numeric: { value: pSummary.revenue, format: formatCurrency },
      icon: <IconWallet size={15} />,
      accent: ct.accent,
    },
    {
      label: 'Cost',
      numeric: { value: pSummary.cost, format: formatCurrency },
      icon: <IconLayers size={15} />,
      accent: ct.amber,
    },
    {
      label: 'Gross Profit',
      numeric: { value: pSummary.gross_profit, format: formatCurrency },
      icon: <IconTrending size={15} />,
      accent: ct.violet,
    },
    {
      label: 'Margin',
      value: pSummary.margin_pct != null ? `${formatNumber(pSummary.margin_pct, 1)}%` : '—',
      icon: <IconActivity size={15} />,
      accent: ct.blue,
    },
  ]

  // Fresh-start: no invoices in the DB -> friendly empty state, never bare zeros.
  if (hasData === false) {
    return (
      <NoData
        title="No data yet"
        message="Import your billing data to unlock profit analysis, demand forecasts and growth tracking."
      />
    )
  }

  return (
    <div className="page">
      {purchasesActive && (
        <section className="page-group">
          <div className="section-head">
            <h2 className="section-heading">Purchases analysis</h2>
            <p className="section-sub">Supplier spend across the selected range</p>
          </div>
          <div className="kpi-grid kpi-4">
            {purchasesStats.map((s, i) => (
              <StatCard key={s.label} {...s} index={i + 1} />
            ))}
          </div>
          <div className="grid-1-2">
            <ChartCard title="Monthly purchases" subtitle="Supplier purchase value per month" bodyStyle={{ height: 300 }}>
              {purMonthly.length === 0 ? (
                <EmptyState title="No purchase data" message="No monthly purchase points in the range." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={purMonthly} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="insPurGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ct.amber} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={ct.amber} stopOpacity={0.25} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={ct.grid} strokeOpacity={0.7} vertical={false} strokeDasharray="4 6" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={formatMonthShort}
                      tick={axisTick}
                      tickLine={false}
                      axisLine={{ stroke: ct.grid }}
                      minTickGap={24}
                    />
                    <YAxis
                      tickFormatter={formatLakhCompact}
                      tick={axisTick}
                      tickLine={false}
                      axisLine={false}
                      width={58}
                    />
                    <Tooltip
                      cursor={{ fill: ct.hoverFill }}
                      content={<ChartTooltip labelFormatter={(l) => formatMonth(l)} formatter={(v) => formatCurrency(v)} />}
                    />
                    <Bar
                      dataKey="amount"
                      name="Purchases"
                      fill="url(#insPurGrad)"
                      radius={[6, 6, 0, 0]}
                      barSize={18}
                      isAnimationActive={false}
                    >
                      {purMonthly.length <= 12 && (
                        <LabelList
                          dataKey="amount"
                          position="top"
                          formatter={formatLakhCompact}
                          fill={ct.amber}
                          fontSize={10.5}
                        />
                      )}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Top suppliers" subtitle="Ranked by purchase value in range">
              <DataTable
                columns={[
                  {
                    key: 'rank',
                    header: '#',
                    width: 52,
                    render: (r, i) => <span className={`supplier-rank num${i === 0 ? ' rank-1' : ''}`}>{i + 1}</span>,
                  },
                  {
                    key: 'supplier_name',
                    header: 'Supplier',
                    title: (r) => r.supplier_name,
                    render: (r) => truncate(r.supplier_name || '—', 34),
                  },
                  { key: 'bills', header: 'Bills', align: 'right', render: (r) => formatNumber(r.bills) },
                  {
                    key: 'amount',
                    header: 'Purchases',
                    align: 'right',
                    render: (r) => <span className="num">{formatCurrency(r.amount)}</span>,
                  },
                ]}
                rows={topSuppliers}
                keyField="supplier_name"
                maxHeight={300}
                loadingRows={6}
                emptyTitle="No supplier data"
                emptyMessage="No supplier purchases in the selected range."
              />
            </ChartCard>
          </div>
        </section>
      )}

      <section className="page-group">
        <div className="section-head">
          <h2 className="section-heading">Item performance</h2>
          <p className="section-sub">Best and worst performing items — click a column to sort</p>
        </div>
        <ChartCard
          title="Top items"
          subtitle="Ranked by estimated profit — first 25 items"
          actions={
            itemBasis === 'mrp' ? (
              <span className="note-chip">Revenue estimated at MRP</span>
            ) : null
          }
        >
          <SortableTable
            columns={ITEM_COLUMNS}
            rows={itemRows}
            keyField="item_code"
            initialSort={{ key: 'profit_est', dir: 'desc' }}
            maxHeight={420}
            loading={itemPerfQ.loading}
            loadingRows={8}
            emptyTitle="No item performance data"
            emptyMessage="Import invoices with line items to see item-level performance."
          />
        </ChartCard>
      </section>

      <section className="page-group">
        <div className="section-head">
          <h2 className="section-heading">Brand mix</h2>
          <p className="section-sub">Revenue concentration by brand (estimated at MRP)</p>
        </div>
        <div className="grid-1-1">
          <ChartCard
            title="Revenue share"
            subtitle={brandDimension === 'brand' ? 'Top 8 brands' : 'Top 8 departments'}
            actions={
              <div className="seg">
                <button
                  type="button"
                  className={brandDimension === 'brand' ? 'active' : undefined}
                  onClick={() => setBrandDimension('brand')}
                >
                  Brand
                </button>
                <button
                  type="button"
                  className={brandDimension === 'department' ? 'active' : undefined}
                  onClick={() => setBrandDimension('department')}
                >
                  Department
                </button>
              </div>
            }
            bodyStyle={{ height: 320 }}
          >
            {brandQ.loading ? (
              <div className="chart-loading">
                <LoadingSpinner label="Loading brand mix…" />
              </div>
            ) : brandQ.error ? (
              <ErrorBanner error={brandQ.error} onRetry={brandQ.retry} />
            ) : brandDonut.length === 0 ? (
              <EmptyState title="No brand data" message="No brand-level sales in the data." />
            ) : (
              <div className="donut-row">
                <div className="donut-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={brandDonut}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="62%"
                        outerRadius="88%"
                        paddingAngle={2}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {brandDonut.map((d, i) => (
                          <Cell key={d.name} fill={brandColors[i % brandColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center">
                    <strong className="num">{formatLakhCompact(brandTotal)}</strong>
                    <span>revenue</span>
                  </div>
                </div>
                <div className="legend">
                  {brandDonut.map((d, i) => (
                    <div key={d.name} className="legend-item legend-static">
                      <span className="legend-dot" style={{ background: brandColors[i % brandColors.length] }} />
                      <span className="legend-name" title={d.name}>
                        {truncate(d.name, 22)}
                      </span>
                      <span className="legend-value num">{formatLakhCompact(d.value)}</span>
                      <span className="legend-share num">
                        {brandTotal ? Math.round((d.value / brandTotal) * 100) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ChartCard>

          <ChartCard
            title={brandDimension === 'brand' ? 'Brand breakdown' : 'Department breakdown'}
            subtitle="Items, quantity and estimated revenue"
          >
            <DataTable
              columns={[
                { key: 'name', header: brandDimension === 'brand' ? 'Brand' : 'Department', title: (r) => r.name },
                { key: 'items', header: 'Items', align: 'right', render: (r) => formatNumber(r.items) },
                { key: 'qty_sold', header: 'Qty sold', align: 'right', render: (r) => formatQty(r.qty_sold) },
                {
                  key: 'revenue_est',
                  header: 'Revenue est.',
                  align: 'right',
                  render: (r) => <span className="num">{formatCurrency(r.revenue_est)}</span>,
                },
              ]}
              rows={brandRows}
              keyField="name"
              loading={brandQ.loading}
              maxHeight={320}
              loadingRows={6}
              emptyTitle="No brand data"
              emptyMessage="No brand-level sales in the data."
            />
          </ChartCard>
        </div>
      </section>

      <section className="page-group">
        <div className="section-head">
          <h2 className="section-heading">Profit analysis</h2>
          <p className="section-sub">Revenue vs cost across the selected range</p>
        </div>
        {profitQ.loading ? (
          <div className="kpi-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card stat-card">
                <div className="skeleton skeleton-row" style={{ width: '55%' }} />
                <div className="skeleton stat-skeleton-value" />
              </div>
            ))}
          </div>
        ) : profitQ.error ? (
          <ErrorBanner error={profitQ.error} onRetry={profitQ.retry} />
        ) : (
          <>
            <div className="kpi-grid kpi-4">
              {profitStats.map((s, i) => (
                <StatCard key={s.label} {...s} index={i + 4} />
              ))}
            </div>

            <div className="grid-1-2" style={{ marginTop: 14 }}>
              <ChartCard
                title="Gross profit by branch"
                subtitle="Profit contribution per branch"
                bodyStyle={{ height: 250 }}
              >
                {byBranch.length === 0 ? (
                  <EmptyState title="No branch profit data" message="No profit rows returned for the range." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byBranch} layout="vertical" margin={{ top: 4, right: 84, left: 0, bottom: 4 }}>
                      <defs>
                        <linearGradient id="insBranchGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={ct.violet} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={ct.violet} stopOpacity={0.95} />
                        </linearGradient>
                      </defs>
                      <XAxis type="number" hide domain={[0, (max) => Math.ceil(max * 1.18)]} />
                      <YAxis
                        type="category"
                        dataKey="branch_code"
                        tickFormatter={(c) => `Branch ${c}`}
                        tick={axisTick}
                        tickLine={false}
                        axisLine={false}
                        width={78}
                      />
                      <Tooltip
                        cursor={{ fill: ct.hoverFill }}
                        content={<ChartTooltip labelFormatter={(l) => `Branch ${l}`} formatter={(v) => formatCurrency(v)} />}
                      />
                      <Bar
                        dataKey="profit"
                        name="Gross profit"
                        fill="url(#insBranchGrad)"
                        radius={[0, 6, 6, 0]}
                        barSize={16}
                        isAnimationActive={false}
                      >
                        <LabelList
                          dataKey="profit"
                          position="right"
                          formatter={formatLakhCompact}
                          fill={ct.violet}
                          fontSize={12}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Top profit products" subtitle="Ranked by gross profit in range">
                <DataTable
                  columns={[
                    { key: 'item_code', header: 'Code', width: 104, render: (r) => <span className="mono">{r.item_code || '—'}</span> },
                    { key: 'item_name', header: 'Product', title: (r) => r.item_name },
                    { key: 'qty', header: 'Qty', align: 'right', render: (r) => formatQty(r.qty) },
                    { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatCurrency(r.revenue) },
                    { key: 'cost', header: 'Cost', align: 'right', render: (r) => formatCurrency(r.cost) },
                    { key: 'profit', header: 'Profit', align: 'right', render: (r) => <span className="text-green num">{formatCurrency(r.profit)}</span> },
                    {
                      key: 'margin_pct',
                      header: 'Margin',
                      align: 'right',
                      render: (r) => (r.margin_pct != null ? `${formatNumber(r.margin_pct, 1)}%` : '—'),
                    },
                  ]}
                  rows={topProducts}
                  keyField="item_code"
                  maxHeight={340}
                  loadingRows={8}
                  emptyTitle="No profit data"
                  emptyMessage="No product-level profit rows for the selected range."
                />
              </ChartCard>
            </div>
          </>
        )}
      </section>

      <section className="page-group">
        <div className="section-head">
          <h2 className="section-heading">Demand forecast</h2>
          <p className="section-sub">Monthly revenue projection with confidence band</p>
        </div>
        <ChartCard
          title="Monthly revenue forecast"
          subtitle={forecastQ.data && forecastQ.data.method ? `Method: ${forecastQ.data.method}` : 'Projection of future monthly revenue'}
          actions={
            <MiniLegend
              items={[
                { label: 'Actual', color: ct.accent },
                { label: 'Projected', color: ct.accent2, dashed: true },
                { label: 'Range', color: ct.accent2 },
              ]}
            />
          }
          bodyStyle={{ height: 300 }}
        >
          {forecastQ.loading ? (
            <div className="chart-loading">
              <LoadingSpinner label="Loading forecast…" />
            </div>
          ) : forecastQ.error ? (
            <ErrorBanner error={forecastQ.error} onRetry={forecastQ.retry} />
          ) : forecastData.length === 0 ? (
            <EmptyState title="No forecast data" message="The API returned no forecast history or projection." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="insFcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ct.accent} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={ct.accent} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={ct.grid} strokeOpacity={0.7} vertical={false} strokeDasharray="4 6" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatMonthShort}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={{ stroke: ct.grid }}
                  minTickGap={26}
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
                      labelFormatter={(l) => formatMonth(l)}
                      formatter={(v, entry) =>
                        entry && entry.dataKey === 'projected' ? `~ ${formatCurrency(v)}` : formatCurrency(v)
                      }
                    />
                  }
                  cursor={{ stroke: ct.cursor, strokeDasharray: '4 4' }}
                />
                <Area
                  type="monotone"
                  dataKey="actual"
                  name="Actual"
                  stroke={ct.accent}
                  strokeWidth={2}
                  fill="url(#insFcGrad)"
                  connectNulls={false}
                  activeDot={{
                    r: 5,
                    fill: ct.accent,
                    stroke: 'rgba(255, 255, 255, 0.85)',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="bandBase"
                  stackId="band"
                  stroke="none"
                  fill="none"
                  connectNulls={false}
                  legendType="none"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="bandSpan"
                  stackId="band"
                  name="Projection range"
                  stroke="none"
                  fill={ct.accent2}
                  fillOpacity={0.1}
                  connectNulls={false}
                  legendType="none"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Projected"
                  stroke={ct.accent2}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                  activeDot={{ r: 4, fill: ct.accent2, stroke: 'rgba(255, 255, 255, 0.85)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>

      <div className="grid-1-1">
        <section className="page-group">
          <div className="section-head">
            <h2 className="section-heading">Category performance</h2>
            <p className="section-sub">Quantity, revenue and profit per category</p>
          </div>
          <ChartCard>
            {categoryQ.error ? (
              <ErrorBanner error={categoryQ.error} onRetry={categoryQ.retry} />
            ) : (
              <DataTable
                columns={[
                  { key: 'category', header: 'Category', title: (r) => r.category },
                  { key: 'qty', header: 'Qty', align: 'right', render: (r) => formatQty(r.qty) },
                  { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatCurrency(r.revenue) },
                  { key: 'profit', header: 'Profit', align: 'right', render: (r) => formatCurrency(r.profit) },
                  {
                    key: 'margin',
                    header: 'Margin',
                    align: 'right',
                    render: (r) =>
                      Number(r.revenue) > 0
                        ? `${formatNumber((Number(r.profit) / Number(r.revenue)) * 100, 1)}%`
                        : '—',
                  },
                ]}
                rows={(categoryQ.data && categoryQ.data.rows) || []}
                keyField="category"
                loading={categoryQ.loading}
                maxHeight={340}
                loadingRows={6}
                emptyTitle="No category data"
                emptyMessage="No category sales in the selected range."
              />
            )}
          </ChartCard>
        </section>

        <section className="page-group">
          <div className="section-head">
            <h2 className="section-heading">Hourly traffic</h2>
            <p className="section-sub">Invoices raised per hour of day</p>
          </div>
          <ChartCard bodyStyle={{ height: 340 }}>
            {hourlyQ.loading ? (
              <div className="chart-loading">
                <LoadingSpinner label="Loading traffic…" />
              </div>
            ) : hourlyQ.error ? (
              <ErrorBanner error={hourlyQ.error} onRetry={hourlyQ.retry} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="insHourGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ct.blue} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={ct.blue} stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={ct.grid} strokeOpacity={0.7} vertical={false} strokeDasharray="4 6" />
                  <XAxis
                    dataKey="hour"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={{ stroke: ct.grid }}
                    interval={2}
                  />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    cursor={{ fill: ct.hoverFill }}
                    content={
                      <ChartTooltip
                        labelFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
                        formatter={(v, entry) =>
                          entry && entry.dataKey === 'invoices' ? `${formatNumber(v)} invoices` : formatCurrency(v)
                        }
                      />
                    }
                  />
                  <Bar
                    dataKey="invoices"
                    name="Invoices"
                    fill="url(#insHourGrad)"
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </section>
      </div>

      <section className="page-group">
        <div className="section-head">
          <h2 className="section-heading">Month-over-month growth</h2>
          <p className="section-sub">Revenue and invoice growth per month</p>
        </div>
        <ChartCard>
          {trendsQ.error ? (
            <ErrorBanner error={trendsQ.error} onRetry={trendsQ.retry} />
          ) : (
            <DataTable
              columns={[
                { key: 'month', header: 'Month', render: (r) => formatMonth(r.month) },
                { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatCurrency(r.revenue) },
                { key: 'invoices', header: 'Invoices', align: 'right', render: (r) => formatNumber(r.invoices) },
                {
                  key: 'growth',
                  header: 'Growth',
                  align: 'right',
                  render: (r) =>
                    r.growth == null ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className={r.growth >= 0 ? 'text-green' : 'text-red'}>{formatPercent(r.growth)}</span>
                    ),
                },
              ]}
              rows={[...growthRows].reverse()}
              keyField="month"
              loading={trendsQ.loading}
              maxHeight={380}
              loadingRows={8}
              emptyTitle="No trend data"
              emptyMessage="No monthly points available."
            />
          )}
        </ChartCard>
      </section>
    </div>
  )
}
