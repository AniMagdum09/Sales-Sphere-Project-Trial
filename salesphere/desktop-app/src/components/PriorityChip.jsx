// Reorder priority chip: HIGH / MEDIUM / LOW.
export default function PriorityChip({ priority }) {
  const p = String(priority || '').toUpperCase()
  const cls = p === 'HIGH' ? 'badge-red' : p === 'MEDIUM' ? 'badge-amber' : p === 'LOW' ? 'badge-green' : 'badge-muted'
  return (
    <span className={`badge ${cls}`}>
      <span className={`priority-dot priority-${p.toLowerCase() || 'low'}`} />
      {p || 'LOW'}
    </span>
  )
}
