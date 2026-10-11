import { IconAlert, IconRefresh } from './icons'

export default function ErrorBanner({ error, title = 'Could not load data', onRetry }) {
  const message =
    typeof error === 'string'
      ? error
      : error && error.message
        ? error.message
        : 'An unknown error occurred.'

  return (
    <div className="error-banner" role="alert">
      <span className="error-icon">
        <IconAlert size={18} />
      </span>
      <div className="error-body">
        <strong>{title}</strong>
        <p>{message}</p>
        <p className="error-hint">
          Make sure the analytics API is running, then retry. If it lives at a different address,
          update it in Settings (gear icon, top right).
        </p>
      </div>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          <IconRefresh size={14} />
          Retry
        </button>
      ) : null}
    </div>
  )
}
