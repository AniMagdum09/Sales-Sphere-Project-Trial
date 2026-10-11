import { RANGES, useFilters } from '../state'

export default function RangeChips() {
  const { filters, setRange } = useFilters()
  return (
    <div className="range-chips" role="group" aria-label="Date range">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          className={`range-chip${filters.range === r.id ? ' active' : ''}`}
          aria-pressed={filters.range === r.id}
          onClick={() => setRange(r.id)}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
