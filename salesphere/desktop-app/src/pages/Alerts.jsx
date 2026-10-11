import { useMemo, useState } from 'react'
import ChartCard from '../components/ChartCard'
import ErrorBanner from '../components/ErrorBanner'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import NoData from '../components/NoData'
import {
  IconAlert,
  IconArrowRight,
  IconBox,
  IconTrending,
} from '../components/icons'
import { apiGet, useApiData } from '../api'
import { useHasData } from '../state'
import { formatLakhCompact, formatCurrency, formatQty } from '../format'

const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'low_stock', label: 'Low stock' },
  { id: 'dead_stock', label: 'Dead stock' },
  { id: 'revenue_drop', label: 'Revenue' },
]

const SEVERITY_LABEL = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
}

export default function Alerts({ onOpenItem }) {
  const { hasData } = useHasData()
  const alertsQ = useApiData(() => apiGet('/api/insights/alerts'), [])
  const [typeFilter, setTypeFilter] = useState('all')

  const alerts = (alertsQ.data && alertsQ.data.alerts) || []
  const counts = useMemo(() => {
    const map = { all: alerts.length }
    alerts.forEach((a) => {
      map[a.type] = (map[a.type] || 0) + 1
    })
    return map
  }, [alerts])
  const filtered = typeFilter === 'all' ? alerts : alerts.filter((a) => a.type === typeFilter)

  const formatValue = (a) => {
    if (a.value == null) return null
    if (a.type === 'revenue_drop') return formatCurrency(a.value)
    if (a.type === 'low_stock') return formatQty(a.value)
    return formatLakhCompact(a.value)
  }

  const handleOpen = (a) => {
    if (a.type === 'low_stock' && a.item_code && onOpenItem) {
      onOpenItem(a.item_code)
    }
  }

  // Fresh-start: no invoices in the DB -> friendly empty state, never bare zeros.
  if (hasData === false) {
    return (
      <NoData
        title="No alerts yet"
        message="Alerts appear automatically once your billing data is imported."
      />
    )
  }

  return (
    <div className="page">
      <ChartCard
        title="Alerts"
        subtitle="Signals that need attention, generated from your latest data"
        actions={
          <div className="seg">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={typeFilter === f.id ? 'active' : ''}
                onClick={() => setTypeFilter(f.id)}
              >
                {f.label}
                {counts[f.id] ? ` (${counts[f.id]})` : ''}
              </button>
            ))}
          </div>
        }
      >
        {alertsQ.loading ? (
          <div className="alert-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="alert-row alert-row-static">
                <div className="skeleton skeleton-row" style={{ width: '40%' }} />
                <div className="skeleton skeleton-row" style={{ width: '70%' }} />
              </div>
            ))}
          </div>
        ) : alertsQ.error ? (
          <ErrorBanner error={alertsQ.error} onRetry={alertsQ.retry} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<IconAlert size={26} />}
            title="All good — no alerts."
            message={
              typeFilter === 'all'
                ? 'Nothing needs your attention right now.'
                : 'No alerts of this type. Try another filter.'
            }
          />
        ) : (
          <div className="alert-list">
            {filtered.map((a, i) => (
              <div
                key={a.id != null ? a.id : i}
                className={`alert-row${a.type === 'low_stock' && a.item_code ? ' alert-row-clickable' : ''}`}
                onClick={() => handleOpen(a)}
                role={a.type === 'low_stock' && a.item_code ? 'button' : undefined}
                title={
                  a.type === 'low_stock' && a.item_code
                    ? 'Open in Inventory with this item pre-filled'
                    : undefined
                }
              >
                <span className={`alert-dot sev-${a.severity || 'info'}`} />
                <span className={`alert-icon sev-icon-${a.severity || 'info'}`}>
                  {a.type === 'revenue_drop' ? <IconTrending size={15} /> : <IconBox size={15} />}
                </span>
                <div className="alert-main">
                  <div className="alert-title-row">
                    <strong className="alert-title">{a.title || 'Alert'}</strong>
                    <span className={`badge sev-badge-${a.severity || 'info'}`}>
                      {SEVERITY_LABEL[a.severity] || 'Info'}
                    </span>
                  </div>
                  <span className="alert-detail">{a.detail || '—'}</span>
                </div>
                <div className="alert-side">
                  {a.value != null && <span className="alert-value num">{formatValue(a)}</span>}
                  {a.type === 'low_stock' && a.item_code && (
                    <span className="alert-open">
                      Inventory <IconArrowRight size={13} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  )
}
