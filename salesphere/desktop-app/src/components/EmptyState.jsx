import { IconInbox } from './icons'

export default function EmptyState({ icon, title = 'No data', message, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon || <IconInbox size={26} />}</span>
      <h4>{title}</h4>
      {message ? <p>{message}</p> : null}
      {action || null}
    </div>
  )
}
