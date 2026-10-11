import EmptyState from './EmptyState'

export default function DataTable({
  columns,
  rows,
  keyField = 'id',
  loading = false,
  loadingRows = 6,
  emptyTitle = 'No records',
  emptyMessage = 'Nothing to display for the current filters.',
  onRowClick,
  selectedKey,
  maxHeight,
}) {
  if (loading) {
    return (
      <div
        className="table-skeleton"
        style={maxHeight ? { maxHeight, overflow: 'hidden' } : undefined}
      >
        {Array.from({ length: loadingRows }).map((_, i) => (
          <div
            key={i}
            className="skeleton skeleton-row"
            style={{ width: `${96 - (i % 4) * 7}%` }}
          />
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
              <th
                key={col.key}
                className={col.align === 'right' ? 'th-right' : undefined}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const key = row[keyField] != null ? row[keyField] : index
            const clickable = typeof onRowClick === 'function'
            const cls = [
              clickable ? 'row-clickable' : '',
              selectedKey != null && row[keyField] === selectedKey ? 'row-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <tr
                key={key}
                className={cls || undefined}
                onClick={clickable ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => {
                  const raw = row[col.key]
                  const fallback = raw == null || raw === '' ? '—' : String(raw)
                  const content = col.render ? col.render(row, index) : fallback
                  const title = col.title
                    ? col.title(row)
                    : typeof raw === 'string' || typeof raw === 'number'
                      ? fallback
                      : undefined
                  return (
                    <td
                      key={col.key}
                      className={col.align === 'right' ? 'td-right' : undefined}
                      title={title}
                    >
                      {content}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
