import { useChartTheme } from '../state'
import { formatNumber } from '../format'

// Themed axis tick style — call inside components under ThemeProvider.
export function useAxisTick() {
  const ct = useChartTheme()
  return { fill: ct.muted, fontSize: 11.5 }
}

export default function ChartCard({ title, subtitle, actions, children, className = '', bodyStyle }) {
  return (
    <section className={`card chart-card ${className}`.trim()}>
      {title || actions ? (
        <header className="card-head">
          <div className="card-head-text">
            {title ? <h3 className="card-title">{title}</h3> : null}
            {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="card-body" style={bodyStyle}>
        {children}
      </div>
    </section>
  )
}

// Shared chart tooltip; pass formatter / labelFormatter when mounting it.
export function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  const ct = useChartTheme()
  if (!active || !payload || payload.length === 0) return null
  // Forecast band helper areas (bandBase / bandSpan) must never show as rows.
  const visible = payload.filter((e) => {
    const k = String(e.dataKey || '')
    return k !== 'bandBase' && k !== 'bandSpan'
  })
  if (visible.length === 0) return null
  return (
    <div className="chart-tooltip">
      <div className="ct-label">{labelFormatter ? labelFormatter(label) : label}</div>
      {visible.map((entry) => {
        const color =
          entry.color || entry.stroke || entry.fill || (entry.payload && entry.payload.fill) || ct.accent
        return (
          <div className="ct-row" key={entry.dataKey || entry.name || entry.value}>
            <span className="ct-dot" style={{ background: color }} />
            <span className="ct-name">{entry.name}</span>
            <span className="ct-value num">
              {formatter ? formatter(entry.value, entry) : formatNumber(entry.value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// Small inline legend used above charts (e.g. Actual vs Forecast).
export function MiniLegend({ items }) {
  return (
    <div className="mini-legend">
      {items.map((it) => (
        <span key={it.label} className="mini-legend-item">
          <span
            className="mini-legend-dot"
            style={{
              background: it.dashed ? 'transparent' : it.color,
              borderColor: it.color,
              borderStyle: it.dashed ? 'dashed' : 'solid',
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}
