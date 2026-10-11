import EmptyState from './EmptyState'
import { useNav } from '../state'
import { IconArrowRight, IconDatabase } from './icons'

// Friendly per-page empty state shown when the database has no invoices yet.
// Never renders bare zeros or broken charts.
export default function NoData({ title = 'No data yet', message }) {
  const navigate = useNav()
  return (
    <div className="page">
      <section className="card nodata-card">
        <EmptyState
          icon={<IconDatabase size={30} />}
          title={title}
          message={
            message ||
            'Your database has no billing data yet. Import a file to bring this page to life.'
          }
          action={
            <button type="button" className="btn btn-primary nodata-cta" onClick={() => navigate('import')}>
              <IconDatabase size={15} />
              Import your data
              <IconArrowRight size={14} />
            </button>
          }
        />
      </section>
    </div>
  )
}
