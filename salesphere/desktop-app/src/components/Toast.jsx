import { ToastProvider as StateToastProvider, useToast } from '../state'
import { IconAlertCircle, IconCheckCircle, IconX } from './icons'

// Wraps the app; renders the bottom-right toast stack from ToastContext.
export default function ToastHost({ children }) {
  return (
    <StateToastProvider>
      {children}
      <ToastStack />
    </StateToastProvider>
  )
}

function ToastStack() {
  const { toasts, dismiss } = useToast()
  if (!toasts || toasts.length === 0) return null
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role="status">
          <span className="toast-icon">
            {t.kind === 'error' ? (
              <IconAlertCircle size={16} />
            ) : t.kind === 'success' ? (
              <IconCheckCircle size={16} />
            ) : (
              <IconAlertCircle size={16} />
            )}
          </span>
          <div className="toast-body">
            {t.title ? <strong className="toast-title">{t.title}</strong> : null}
            <span className="toast-msg">{t.message}</span>
          </div>
          <button
            type="button"
            className="toast-close"
            title="Dismiss"
            onClick={() => dismiss(t.id)}
          >
            <IconX size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
