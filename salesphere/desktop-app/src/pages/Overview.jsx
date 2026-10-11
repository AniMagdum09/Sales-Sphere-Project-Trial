import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
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
import ErrorBanner from '../components/ErrorBanner'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import OnboardingHero from '../components/OnboardingHero'
import {
  IconActivity,
  IconAlert,
  IconBox,
  IconCheckCircle,
  IconFileText,
  IconShoppingBag,
  IconTruck,
  IconUsers,
  IconWallet,
} from '../components/icons'
import { apiGet, useApiData } from '../api'
import { useChartTheme, useFilters, useHasData } from '../state'
import {
  formatLakhCompact,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMonth,
  formatMonthShort,
  formatNumber,
  formatQty,
  truncate,
} from '../format'

const SEVERITY_CLASS = {
  critical: 'sev-critical',
  warning: 'sev-warning',
  info: 'sev-info',
}

// Normalize any month-ish key ("2025-04" or "2025-04-01") to "YYYY-MM".
const monthKey = (s) => String(s || '').slice(0, 7)

export default function Overview({ refreshToken, onNavigate }) {
  const ct = useChartTheme()
  const axisTick = useAxisTick()
  const { apiParams, filters } = useFilters()
  const { hasData } = useHasData()

  const mainQ = useApiData(
    () =>
      Promise.all([
        apiGet('/api/overview', apiParams()),
        apiGet('/api/branches', apiParams()),
        apiGet('/api/sales/trends', apiParams({ granularity: 'month' })),
      ]),
    [filters.branch, filters.range, refreshToken]
  )
  const forecastQ = useApiData(
    () => apiGet('/api/insights/forecast', { periods: 3 }),
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
  const alertsQ = useApiData(() => apiGet('/api/insights/alerts'), [refreshToken])
  const purchasesQ = useApiData(
    () => apiGet('/api/insights/purchases', apiParams()),
    [filters.branch, filters.range, refreshToken]
  )

  // --- derived data (all hooks must run before any early return) ------------
  const overview = (mainQ.data && mainQ.data[0]) || {}
  const branches = (mainQ.data && mainQ.data[1] && mainQ.data[1].rows) || []
  const points = (mainQ.data && mainQ.data[2] && mainQ.data[2].points) || []

  const momDelta =
    overview.revenue_this_month != null &&
    overview.revenue_prev_month != null &&
    Number(overview.revenue_prev_month) !== 0
      ? ((Number(overview.revenue_this_month) - Number(overview.revenue_prev_month)) /
          Number(overview.revenue_prev_month)) *
        100
      : null

  const margin =
    overview.margin_pct != null && overview.gross_profit != null
      ? `${formatNumber(overview.margin_pct, 1)}% margin`
      : null

  const hasPurchases = overview.total_purchases != null
  const hasStockValue = overview.stock_value != null

  // KPI row: best 8 metrics in two rows of four. New purchases/stock cards
  // only appear when the backend actually has that data (null = absent).
  const kpis = [
    {
      label: 'Total Revenue',
      numeric: { value: overview.total_revenue, format: formatCurrency },
      icon: <IconWallet size={15} />,
      accent: ct.accent,
      delta: momDelta,
      deltaLabel: 'vs last month',
      sub:
        overview.date_min && overview.date_max
          ? `${formatDate(overview.date_min)} – ${formatDate(overview.date_max)}`
          : null,
    },
    hasPurchases
      ? {
          label: 'Net Margin',
          numeric: { value: overview.net_profit, format: formatCurrency },
          icon: <IconActivity size={15} />,
          accent: ct.violet,
          sub: 'Revenue − purchases',
        }
      : {
          label: 'Gross Profit',
          numeric: { value: overview.gross_profit, format: formatCurrency },
          icon: <IconActivity size={15} />,
          accent: ct.violet,
          sub: margin || 'Cost data unavailable',
        },
    ...(hasPurchases
      ? [
          {
            label: 'Purchases',
            numeric: { value: overview.total_purchases, format: formatCurrency },
            icon: <IconTruck size={15} />,
            accent: ct.amber,
          },
        ]
      : []),
    ...(hasStockValue
      ? [
          {
            label: 'Stock Value',
            numeric: { value: overview.stock_value, format: formatCurrency },
            icon: <IconBox size={15} />,
            accent: ct.accent2,
          },
        ]
      : []),
    {
      label: 'Invoices',
      numeric: { value: overview.total_invoices, format: formatNumber },
      icon: <IconFileText size={15} />,
      accent: ct.blue,
    },
    {
      label: 'Customers',
      numeric: { value: overview.total_customers, format: formatNumber },
      icon: <IconUsers size={15} />,
      accent: ct.pink,
    },
    {
      label: 'Avg Bill',
      numeric: { value: overview.avg_bill_value, format: formatCurrency },
      icon: <IconActivity size={15} />,
      accent: ct.accent,
    },
    ...(overview.items_sold > 0
      ? [
          {
            label: 'Items Sold',
            numeric: { value: overview.items_sold, format: formatQty },
            icon: <IconShoppingBag size={15} />,
            accent: ct.amber,
          },
        ]
      : []),
  ]

  // --- Revenue trend + forecast -------------------------------------------
  const trendData = useMemo(() => {
    const history = points.map((p) => ({ date: p.date, actual: Number(p.revenue) || 0 }))
    const fc = forecastQ.data
    if (!fc || !Array.isArray(fc.forecast) || fc.forecast.length === 0) return history
    const rows = history.map((h) => ({ ...h }))
    if (rows.length > 0) {
      const last = rows[rows.length - 1]
      last.forecast = last.actual // bridge the dashed line to the last actual point
    }
    fc.forecast.forEach((f) => {
      const upper = Number(f.upper)
      const lower = Number(f.lower)
      rows.push({
        date: f.date,
        forecast: Number(f.revenue) || 0,
        bandBase: Number.isFinite(lower) ? lower : undefined,
        bandSpan:
          Number.isFinite(upper) && Number.isFinite(lower) ? Math.max(0, upper - lower) : undefined,
      })
    })
    return rows
  }, [points, forecastQ.data])

  // --- Sales vs Purchases (monthly) -----------------------------------------
  const purchasesData = purchasesQ.data
  const purchasesActive = Boolean(purchasesData && purchasesData.has_data)
  const salesPurchasesData = useMemo(() => {
    const revMap = new Map(points.map((p) => [monthKey(p.date), Number(p.revenue) || 0]))
    const purMap = new Map(
      ((purchasesData && purchasesData.monthly) || []).map((m) => [
        monthKey(m.month),
        Number(m.amount) || 0,
      ])
    )
    const months = Array.from(new Set([...revMap.keys(), ...purMap.keys()])).sort()
    return months.map((m) => ({
      month: m,
      revenue: revMap.get(m) || 0,
      purchases: purMap.get(m) || 0,
    }))
  }, [points, purchasesData])

  // --- Category donut (top 6 + Other) --------------------------------------
  const catRows = (categoryQ.data && categoryQ.data.rows) || []
  const donutData = useMemo(() => {
    const sorted = [...catRows].sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))
    const top = sorted.slice(0, 6).map((r) => ({
      name: r.category || 'Uncategorised',
      value: Number(r.revenue) || 0,
    }))
    const rest = sorted.slice(6)
    if (rest.length > 0) {
      top.push({ name: 'Other', value: rest.reduce((acc, r) => acc + (Number(r.revenue) || 0), 0) })
    }
    return top.filter((d) => d.value > 0)
  }, [catRows])
  const donutTotal = donutData.reduce((acc, d) => acc + d.value, 0)

  // --- Hourly bars (0..23) --------------------------------------------------
  const hourlyData = useMemo(() => {
    const map = new Map()
    ;((hourlyQ.data && hourlyQ.data.rows) || []).forEach((r) => {
      map.set(Number(r.hour), Number(r.revenue) || 0)
    })
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: map.get(h) || 0 }))
  }, [hourlyQ.data])

  // --- Alerts strip ----------------------------------------------------------
  const alerts = (alertsQ.data && alertsQ.data.alerts) || []
  const topAlerts = alerts.slice(0, 3)

  // Fresh-start onboarding: no invoices in the DB -> hero instead of zero KPIs.
  if (hasData === false) {
    return (
      <div className="page">
        <OnboardingHero />
      </div>
    )
  }

  if (mainQ.loading) {
    return (
      <div className="page">
        <div className="kpi-grid kpi-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card stat-card">
              <div className="skeleton skeleton-row" style={{ width: '55%' }} />
              <div className="skeleton stat-skeleton-value" />
            </div>
          ))}
        </div>
        <div className="card" style={{ height: 340 }}>
          <div className="page-loading">
            <LoadingSpinner label="Loading overview…" />
          </div>
        </div>
      </div>
    )
  }

  if (mainQ.error) {
    return (
      <div className="page">
        <ErrorBanner error={mainQ.error} onRetry={mainQ.retry} />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="kpi-grid kpi-4">
        {kpis.map((k, i) => (
          <StatCard key={k.label} {...k} index={i} />
        ))}
      </div>

      <ChartCard
        title="Revenue trend"
        subtitle="Monthly revenue with forward forecast"
        actions={<MiniLegend items={[{ label: 'Actual', color: ct.accent }, { label: 'Forecast', color: ct.accent2, dashed: true }]} />}
        bodyStyle={{ height: 300 }}
      >
        {trendData.length === 0 ? (
          <EmptyState title="No trend data" message="The API returned no monthly revenue points." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ovRevGrad" x1="0" y1="0" x2="0" y2="1">
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
                minTickGap={28}
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
                      entry && entry.dataKey === 'forecast' ? `~ ${formatCurrency(v)}` : formatCurrency(v)
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
                fill="url(#ovRevGrad)"
                connectNulls={false}
                activeDot={{
                  r: 5,
                  fill: ct.accent,
                  stroke: 'rgba(255, 255, 255, 0.85)',
                  strokeWidth: 2,
                }}
                style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${ct.accent} 40%, transparent))` }}
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
                name="Forecast range"
                stroke="none"
                fill={ct.accent2}
                fillOpacity={0.06}
                connectNulls={false}
                legendType="none"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="forecast"
                name="Forecast"
                stroke={ct.accent2}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 3, fill: ct.accent2, stroke: 'rgba(255, 255, 255, 0.7)', strokeWidth: 1.5 }}
                connectNulls
                activeDot={{ r: 4, fill: ct.accent2, stroke: 'rgba(255, 255, 255, 0.85)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {purchasesActive && (
        <ChartCard
            title="Sales vs Purchases"
            subtitle="Monthly revenue against supplier purchases"
            actions={
              <MiniLegend
                items={[
                  { label: 'Purchases', color: ct.blue },
                  { label: 'Revenue', color: ct.accent },
                ]}
              />
            }
            bodyStyle={{ height: 300 }}
          >
            {salesPurchasesData.length === 0 ? (
              <EmptyState title="No monthly data" message="No monthly purchases or revenue points in range." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={salesPurchasesData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ovPurGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ct.blue} stopOpacity={0.85} />
                      <stop offset="100%" stopColor={ct.blue} stopOpacity={0.25} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={ct.grid} strokeOpacity={0.7} vertical={false} strokeDasharray="4 6" />
                  <XAxis
                    dataKey="month"
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
                    cursor={{ fill: ct.hoverFill }}
                    content={
                      <ChartTooltip
                        labelFormatter={(l) => formatMonth(l)}
                        formatter={(v) => formatCurrency(v)}
                      />
                    }
                  />
                  <Bar
                    dataKey="purchases"
                    name="Purchases"
                    fill="url(#ovPurGrad)"
                    radius={[6, 6, 0, 0]}
                    barSize={18}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={ct.accent}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{
                      r: 5,
                      fill: ct.accent,
                      stroke: 'rgba(255, 255, 255, 0.85)',
                      strokeWidth: 2,
                    }}
                    style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${ct.accent} 45%, transparent))` }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        )}

      <div className="grid-1-2">
        <ChartCard title="Revenue by branch" subtitle="Revenue per branch in range" bodyStyle={{ height: 220 }}>
          {branches.length === 0 ? (
            <EmptyState title="No branch data" message="The API returned no branch rows." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={branches}
                layout="vertical"
                margin={{ top: 4, right: 84, left: 0, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="ovBranchGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={ct.blue} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ct.blue} stopOpacity={0.95} />
                  </linearGradient>
                </defs>
                <XAxis type="number" hide domain={[0, (max) => Math.ceil(max * 1.15)]} />
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
                  content={
                    <ChartTooltip
                      labelFormatter={(l) => `Branch ${l}`}
                      formatter={(v) => formatCurrency(v)}
                    />
                  }
                />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill="url(#ovBranchGrad)"
                  radius={[0, 6, 6, 0]}
                  barSize={16}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="revenue"
                    position="right"
                    formatter={formatLakhCompact}
                    fill={ct.accent}
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Category mix"
          subtitle="Revenue share by category (top 6)"
          bodyStyle={{ height: 220 }}
        >
          {categoryQ.loading ? (
            <div className="chart-loading">
              <LoadingSpinner label="Loading categories…" />
            </div>
          ) : categoryQ.error ? (
            <ErrorBanner error={categoryQ.error} onRetry={categoryQ.retry} />
          ) : donutData.length === 0 ? (
            <EmptyState title="No category data" message="No category sales in the selected range." />
          ) : (
            <div className="donut-row">
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="88%"
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {donutData.map((d, i) => (
                        <Cell key={d.name} fill={ct.series[i % ct.series.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<ChartTooltip formatter={(v) => formatCurrency(v)} />}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <strong className="num">{formatLakhCompact(donutTotal)}</strong>
                  <span>revenue</span>
                </div>
              </div>
              <div className="legend">
                {donutData.map((d, i) => (
                  <div key={d.name} className="legend-item legend-static">
                    <span
                      className="legend-dot"
                      style={{ background: ct.series[i % ct.series.length] }}
                    />
                    <span className="legend-name" title={d.name}>
                      {truncate(d.name, 22)}
                    </span>
                    <span className="legend-value num">{formatLakhCompact(d.value)}</span>
                    <span className="legend-share num">
                      {donutTotal ? Math.round((d.value / donutTotal) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid-1-1">
        <ChartCard title="Hourly sales pattern" subtitle="Revenue by hour of day (0–23)" bodyStyle={{ height: 260 }}>
          {hourlyQ.loading ? (
            <div className="chart-loading">
              <LoadingSpinner label="Loading hourly pattern…" />
            </div>
          ) : hourlyQ.error ? (
            <ErrorBanner error={hourlyQ.error} onRetry={hourlyQ.retry} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ovHourGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ct.violet} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={ct.violet} stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={ct.grid} strokeOpacity={0.7} vertical={false} strokeDasharray="4 6" />
                <XAxis
                  dataKey="hour"
                  tickFormatter={(h) => `${h}`}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={{ stroke: ct.grid }}
                  interval={1}
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
                  content={
                    <ChartTooltip
                      labelFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
                      formatter={(v) => formatCurrency(v)}
                    />
                  }
                />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill="url(#ovHourGrad)"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Latest alerts"
          subtitle="Top signals from your data"
          actions={
            <button type="button" className="btn btn-sm" onClick={() => onNavigate('alerts')}>
              View all
            </button>
          }
        >
          {alertsQ.loading ? (
            <div className="chart-loading">
              <LoadingSpinner label="Loading alerts…" />
            </div>
          ) : alertsQ.error ? (
            <ErrorBanner error={alertsQ.error} onRetry={alertsQ.retry} />
          ) : topAlerts.length === 0 ? (
            <EmptyState
              icon={<IconCheckCircle size={24} />}
              title="All good — no alerts"
              message="Nothing needs your attention right now."
            />
          ) : (
            <div className="alert-strip">
              {topAlerts.map((a, i) => (
                <button
                  key={a.id != null ? a.id : i}
                  type="button"
                  className="alert-strip-row"
                  onClick={() => onNavigate('alerts')}
                >
                  <span className={`alert-dot ${SEVERITY_CLASS[a.severity] || 'sev-info'}`} />
                  <span className="alert-strip-icon">
                    <IconAlert size={14} />
                  </span>
                  <span className="alert-strip-text">
                    <strong>{a.title || 'Alert'}</strong>
                    <span>{a.detail || ''}</span>
                  </span>
                  {a.value != null && (
                    <span className="alert-strip-value num">
                      {a.type === 'revenue_drop' ? formatLakhCompact(a.value) : formatQty(a.value)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <div className="meta-strip">
        <span>
          Last synced: {overview.last_synced_at ? formatDateTime(overview.last_synced_at) : 'Not available'}
        </span>
        <span>All amounts in INR (₹)</span>
      </div>
    </div>
  )
}
