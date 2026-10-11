import { IconArrowDown, IconArrowUp } from './icons'
import { formatPercent, useCountUp } from '../format'

// KPI card: icon chip, label, gradient headline number (count-up on mount),
// animated accent underline, optional delta badge and sub line.
// Pass `numeric = { value, format }` to animate the number; otherwise the
// pre-formatted `value` string is shown as-is.
export default function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
  size,
  delta,
  deltaLabel,
  numeric,
  index,
  underline = true,
  title,
}) {
  const target = numeric ? numeric.value : null
  const animated = useCountUp(target)
  const shown = numeric
    ? numeric.value == null
      ? '—'
      : numeric.format(animated)
    : value
  const up = delta != null && delta >= 0
  return (
    <div
      className={`card stat-card${size === 'sm' ? ' stat-sm' : ''}${index != null ? ' anim-in' : ''}`}
      style={index != null ? { '--i': index } : undefined}
      title={title}
    >
      <div className="stat-top">
        {icon ? (
          <span className="stat-icon" style={accent ? { color: accent } : undefined}>
            {icon}
          </span>
        ) : null}
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value num" title={numeric && numeric.value != null ? numeric.format(numeric.value) : undefined}>
        {shown}
      </div>
      {underline ? <i className="stat-underline" aria-hidden="true" /> : null}
      {(delta != null || sub) && (
        <div className="stat-foot">
          {delta != null && (
            <span className={`delta-badge ${up ? 'delta-up' : 'delta-down'}`}>
              {up ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />}
              {formatPercent(delta)}
            </span>
          )}
          {deltaLabel ? <span className="delta-label">{deltaLabel}</span> : null}
          {sub ? <div className="stat-sub">{sub}</div> : null}
        </div>
      )}
    </div>
  )
}
