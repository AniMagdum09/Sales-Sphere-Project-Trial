import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import ChartCard, { ChartTooltip, useAxisTick } from '../components/ChartCard'
import DataTable from '../components/DataTable'
import ErrorBanner from '../components/ErrorBanner'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import NoData from '../components/NoData'
import PriorityChip from '../components/PriorityChip'
import { IconDownload, IconSearch } from '../components/icons'
import { apiDownload, apiGet, useApiData } from '../api'
import { useChartTheme, useHasData, useToast } from '../state'
import { formatCurrency, formatDate, formatDayShort, formatNumber, formatQty } from '../format'

const FSN_CATS = [
  { key: 'F', label: 'Fast moving', colorKey: 'accent' },
  { key: 'S', label: 'Slow moving', colorKey: 'amber' },
  { key: 'N', label: 'Non-moving', colorKey: 'red' },
]

function categoryBadge(cat) {
  const found = FSN_CATS.find((c) => c.key === cat)
  if (!found) return <span className="badge badge-muted">{cat || '—'}</span>
  const cls = cat === 'F' ? 'badge-green' : cat === 'S' ? 'badge-amber' : 'badge-red'
  return <span className={`badge ${cls}`}>{found.label}</span>
}

export default function Inventory({ refreshToken, initialSearch }) {
  const ct = useChartTheme()
  const axisTick = useAxisTick()
  const { hasData } = useHasData()
  const toast = useToast()
  const [searchInput, setSearchInput] = useState(initialSearch || '')
  const [search, setSearch] = useState(initialSearch || '')
  const [deadDays, setDeadDays] = useState(90)
  const [fsnFilter, setFsnFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [movement, setMovement] = useState({ state: 'idle' })
  const [movementTick, setMovementTick] = useState(0)
  const [exporting, setExporting] = useState(false)

  // Consume an alert-triggered search (navigate from Alerts page).
  useEffect(() => {
    if (initialSearch != null && initialSearch !== '') {
      setSearchInput(initialSearch)
      setSearch(initialSearch)
    }
  }, [initialSearch])

  // Debounce the search box before hitting the API.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const fsnQ = useApiData(
    () => apiGet('/api/inventory/fsn', { fast_days: 30, slow_days: 90 }),
    [refreshToken]
  )
  const stockQ = useApiData(
    () => apiGet('/api/inventory/current-stock', { search, limit: 50 }),
    [search, refreshToken]
  )
  const deadQ = useApiData(() => apiGet('/api/inventory/dead-stock', { days: deadDays }), [
    deadDays,
    refreshToken,
  ])
  const reorderQ = useApiData(
    () => apiGet('/api/insights/reorder', { window_days: 30, coverage_days: 21, limit: 50 }),
    [refreshToken]
  )

  // Movement drill-down for the selected item.
  const selectedItemCode = selected ? selected.item_code : null
  useEffect(() => {
    if (!selectedItemCode) {
      setMovement({ state: 'idle' })
      return undefined
    }
    let alive = true
    setMovement({ state: 'loading' })
    apiGet('/api/inventory/movement', { item_code: selectedItemCode })
      .then((d) => {
        if (alive) setMovement({ state: 'done', data: d })
      })
      .catch((e) => {
        if (alive) setMovement({ state: 'error', error: e })
      })
    return () => {
      alive = false
    }
  }, [selectedItemCode, movementTick])

  const handleSelect = (row) => setSelected({ item_code: row.item_code, item_name: row.item_name })

  const handleReorderExport = async () => {
    setExporting(true)
    try {
      const name = await apiDownload(
        '/api/export/report.csv',
        { kind: 'reorder' },
        'reorder_suggestions.csv'
      )
      toast.success(`Export ready — ${name}`, 'Download started')
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Export failed', 'Export error')
    } finally {
      setExporting(false)
    }
  }

  const fsnSummary = (fsnQ.data && fsnQ.data.summary) || {}
  const fsnRows = (fsnQ.data && fsnQ.data.rows) || []
  const filteredFsnRows = fsnFilter === 'all' ? fsnRows : fsnRows.filter((r) => r.category === fsnFilter)

  const donutData = FSN_CATS.map((c) => ({
    ...c,
    color: ct[c.colorKey],
    value: Number(fsnSummary[c.key === 'F' ? 'fast' : c.key === 'S' ? 'slow' : 'non_moving'] ?? 0) || 0,
  }))
  const donutTotal = donutData.reduce((acc, d) => acc + d.value, 0)

  const stockRows = (stockQ.data && stockQ.data.rows) || []
  const totalStockValue = stockQ.data && stockQ.data.total_stock_value != null
    ? stockQ.data.total_stock_value
    : stockRows.reduce((acc, r) => acc + (Number(r.stock_value) || 0), 0)
  const deadRows = (deadQ.data && deadQ.data.rows) || []
  const reorderRows = (reorderQ.data && reorderQ.data.rows) || []
  const movementPoints =
    movement.state === 'done' && movement.data && movement.data.points ? movement.data.points : []

  // Fresh-start: no invoices in the DB -> friendly empty state, never bare zeros.
  if (hasData === false) {
    return (
      <NoData
        title="No inventory data yet"
        message="Import purchases and sales to see stock health, FSN classes and reorder suggestions."
      />
    )
  }

  return (
    <div className="page">
      <div className="grid-1-2">
        <ChartCard
          title="FSN classification"
          subtitle="Fast / Slow / Non-moving stock split"
          bodyStyle={{ height: 250 }}
        >
          {fsnQ.loading ? (
            <div className="chart-loading">
              <LoadingSpinner label="Loading FSN summary…" />
            </div>
          ) : fsnQ.error ? (
            <ErrorBanner error={fsnQ.error} onRetry={fsnQ.retry} />
          ) : donutTotal === 0 ? (
            <EmptyState title="No classification data" message="The API returned an empty FSN summary." />
          ) : (
            <div className="donut-row">
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="label"
                      innerRadius="62%"
                      outerRadius="88%"
                      paddingAngle={2}
                      stroke="none"
                      isAnimationActive={false}
                      onClick={(d) => {
                        const name = d && (d.label || (d.payload && d.payload.label))
                        const cat = FSN_CATS.find((c) => c.label === name)
                        if (cat) setFsnFilter((prev) => (prev === cat.key ? 'all' : cat.key))
                      }}
                    >
                      {donutData.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip formatter={(v) => `${formatNumber(v)} items`} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <strong className="num">{formatNumber(donutTotal)}</strong>
                  <span>items</span>
                </div>
              </div>
              <div className="legend">
                {donutData.map((d) => (
                  <button
                    type="button"
                    key={d.key}
                    className={`legend-item${fsnFilter === d.key ? ' active' : ''}`}
                    onClick={() => setFsnFilter((prev) => (prev === d.key ? 'all' : d.key))}
                  >
                    <span className="legend-dot" style={{ background: d.color }} />
                    <span className="legend-name">{d.label}</span>
                    <span className="legend-value num">{formatNumber(d.value)}</span>
                    <span className="legend-share num">
                      {donutTotal ? Math.round((d.value / donutTotal) * 100) : 0}%
                    </span>
                  </button>
                ))}
                <p className="legend-hint">Click a segment or legend entry to filter the FSN table.</p>
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Item movement"
          subtitle={
            selected
              ? `${selected.item_name || 'Item'} · ${selected.item_code}`
              : 'Quantity sold vs purchased over time'
          }
          actions={
            selected ? (
              <button type="button" className="btn btn-sm" onClick={() => setSelected(null)}>
                Clear selection
              </button>
            ) : null
          }
          bodyStyle={{ height: 250 }}
        >
          {!selected ? (
            <EmptyState
              title="No item selected"
              message="Click a row in Current Stock or Dead Stock below to inspect its daily movement."
            />
          ) : movement.state === 'loading' ? (
            <div className="chart-loading">
              <LoadingSpinner label="Loading movement…" />
            </div>
          ) : movement.state === 'error' ? (
            <ErrorBanner
              title="Could not load movement"
              error={movement.error}
              onRetry={() => setMovementTick((t) => t + 1)}
            />
          ) : movementPoints.length === 0 ? (
            <EmptyState
              title="No movement recorded"
              message="This item has no sold or purchased records in the database."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={movementPoints} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={ct.grid} vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDayShort}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={{ stroke: ct.grid }}
                  minTickGap={30}
                />
                <YAxis
                  tickFormatter={(v) => formatQty(v)}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={46}
                />
                <Tooltip
                  content={<ChartTooltip labelFormatter={formatDate} formatter={(v) => formatQty(v)} />}
                  cursor={{ stroke: ct.cursor, strokeDasharray: '4 4' }}
                />
                <Line
                  type="monotone"
                  dataKey="sold"
                  name="Sold"
                  stroke={ct.accent}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="purchased"
                  name="Purchased"
                  stroke={ct.blue}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Current stock"
        subtitle={
          stockQ.loading
            ? 'Net quantity on hand (purchased − sold)'
            : `Net quantity on hand · total stock value ${formatCurrency(totalStockValue)}`
        }
        actions={
          <div className="search-box">
            <IconSearch size={14} />
            <input
              className="input input-search"
              placeholder="Search item code or name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        }
      >
        {stockQ.error ? (
          <ErrorBanner error={stockQ.error} onRetry={stockQ.retry} />
        ) : (
          <DataTable
            columns={[
              {
                key: 'item_code',
                header: 'Code',
                width: 110,
                render: (r) => <span className="mono">{r.item_code || '—'}</span>,
              },
              { key: 'item_name', header: 'Item', title: (r) => r.item_name },
              { key: 'purchased', header: 'Purchased', align: 'right', render: (r) => formatQty(r.purchased) },
              { key: 'sold', header: 'Sold', align: 'right', render: (r) => formatQty(r.sold) },
              {
                key: 'net_qty',
                header: 'Net Qty',
                align: 'right',
                render: (r) => (
                  <span className={Number(r.net_qty) === 0 ? 'text-amber' : undefined}>
                    {formatQty(r.net_qty)}
                  </span>
                ),
              },
              {
                key: 'stock_value',
                header: 'Stock Value',
                align: 'right',
                render: (r) => formatCurrency(r.stock_value),
              },
              { key: 'last_sold', header: 'Last Sold', render: (r) => formatDate(r.last_sold) },
            ]}
            rows={stockRows}
            keyField="item_code"
            loading={stockQ.loading}
            onRowClick={handleSelect}
            selectedKey={selectedItemCode}
            maxHeight={400}
            loadingRows={8}
            emptyTitle="No items found"
            emptyMessage={search ? `No items match “${search}”.` : 'The current-stock view returned no rows.'}
          />
        )}
      </ChartCard>

      <ChartCard
        title="Reorder suggestions"
        subtitle="Items likely to run out based on recent sales velocity and days of cover"
        actions={
          <button type="button" className="btn btn-ghost" onClick={handleReorderExport} disabled={exporting}>
            <IconDownload size={14} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        }
      >
        {reorderQ.error ? (
          <ErrorBanner error={reorderQ.error} onRetry={reorderQ.retry} />
        ) : (
          <DataTable
            columns={[
              {
                key: 'item_code',
                header: 'Code',
                width: 110,
                render: (r) => <span className="mono">{r.item_code || '—'}</span>,
              },
              { key: 'item_name', header: 'Item', title: (r) => r.item_name },
              { key: 'net_qty', header: 'Net Qty', align: 'right', render: (r) => formatQty(r.net_qty) },
              {
                key: 'avg_daily_sales',
                header: 'Avg Daily Sales',
                align: 'right',
                render: (r) => formatQty(r.avg_daily_sales),
              },
              {
                key: 'coverage_days_left',
                header: 'Days of Cover',
                align: 'right',
                render: (r) =>
                  r.coverage_days_left == null ? (
                    <span className="muted">No sales</span>
                  ) : (
                    formatNumber(r.coverage_days_left, 1)
                  ),
              },
              {
                key: 'suggested_qty',
                header: 'Suggested Qty',
                align: 'right',
                render: (r) => <strong className="num">{formatQty(r.suggested_qty)}</strong>,
              },
              { key: 'priority', header: 'Priority', width: 120, render: (r) => <PriorityChip priority={r.priority} /> },
            ]}
            rows={reorderRows}
            keyField="item_code"
            loading={reorderQ.loading}
            maxHeight={340}
            loadingRows={6}
            emptyTitle="Nothing to reorder"
            emptyMessage="Every item has enough cover for the selected window."
          />
        )}
      </ChartCard>

      <ChartCard
        title="Dead stock"
        subtitle={`Items with no sales in the last ${deadDays} days`}
        actions={
          <label className="filter-field filter-field-row">
            <span>Threshold</span>
            <select
              className="input select-sm"
              value={deadDays}
              onChange={(e) => setDeadDays(Number(e.target.value))}
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
        }
      >
        {deadQ.error ? (
          <ErrorBanner error={deadQ.error} onRetry={deadQ.retry} />
        ) : (
          <DataTable
            columns={[
              {
                key: 'item_code',
                header: 'Code',
                width: 110,
                render: (r) => <span className="mono">{r.item_code || '—'}</span>,
              },
              { key: 'item_name', header: 'Item', title: (r) => r.item_name },
              {
                key: 'days_since_last_sale',
                header: 'Days Idle',
                align: 'right',
                render: (r) => (r.days_since_last_sale == null ? '—' : formatNumber(r.days_since_last_sale)),
              },
              { key: 'last_sold', header: 'Last Sold', render: (r) => formatDate(r.last_sold) },
              { key: 'net_qty', header: 'Net Qty', align: 'right', render: (r) => formatQty(r.net_qty) },
              {
                key: 'total_ever_sold',
                header: 'Ever Sold',
                align: 'right',
                render: (r) => formatQty(r.total_ever_sold),
              },
            ]}
            rows={deadRows}
            keyField="item_code"
            loading={deadQ.loading}
            onRowClick={handleSelect}
            selectedKey={selectedItemCode}
            maxHeight={340}
            emptyTitle="No dead stock"
            emptyMessage={`Every item has sold within the last ${deadDays} days.`}
          />
        )}
      </ChartCard>

      <ChartCard
        title="FSN classification — detail"
        subtitle="Fast: sold within 30 days · Slow: within 90 days · Non-moving: beyond 90 days"
      >
        <div className="table-toolbar">
          <div className="seg" role="group" aria-label="FSN filter">
            <button type="button" className={fsnFilter === 'all' ? 'active' : ''} onClick={() => setFsnFilter('all')}>
              All
            </button>
            <button type="button" className={fsnFilter === 'F' ? 'active' : ''} onClick={() => setFsnFilter('F')}>
              Fast
            </button>
            <button type="button" className={fsnFilter === 'S' ? 'active' : ''} onClick={() => setFsnFilter('S')}>
              Slow
            </button>
            <button type="button" className={fsnFilter === 'N' ? 'active' : ''} onClick={() => setFsnFilter('N')}>
              Non-moving
            </button>
          </div>
        </div>
        <DataTable
          columns={[
            {
              key: 'item_code',
              header: 'Code',
              width: 110,
              render: (r) => <span className="mono">{r.item_code || '—'}</span>,
            },
            { key: 'item_name', header: 'Item', title: (r) => r.item_name },
            { key: 'category', header: 'Category', width: 130, render: (r) => categoryBadge(r.category) },
            {
              key: 'days_since_last_sale',
              header: 'Days Idle',
              align: 'right',
              render: (r) => (r.days_since_last_sale == null ? '—' : formatNumber(r.days_since_last_sale)),
            },
            {
              key: 'total_qty_sold',
              header: 'Qty Sold',
              align: 'right',
              render: (r) => formatQty(r.total_qty_sold),
            },
            {
              key: 'avg_daily_qty',
              header: 'Avg Daily Qty',
              align: 'right',
              render: (r) => formatQty(r.avg_daily_qty),
            },
          ]}
          rows={filteredFsnRows}
          keyField="item_code"
          loading={fsnQ.loading}
          onRowClick={handleSelect}
          selectedKey={selectedItemCode}
          maxHeight={340}
          emptyTitle="No items"
          emptyMessage="No items fall in this FSN category."
        />
      </ChartCard>
    </div>
  )
}
