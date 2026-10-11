import { useEffect, useRef, useState } from 'react'
import { DEFAULT_API_BASE, getApiBase, pingApi, setApiBase } from '../api'
import { IconX } from './icons'

function normalize(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : ''
    return parsed.origin + path
  } catch (err) {
    return ''
  }
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function SettingsModal({ open, onClose, onSaved }) {
  const [url, setUrl] = useState(DEFAULT_API_BASE)
  const [test, setTest] = useState({ state: 'idle' })
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const modalRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement
    setUrl(getApiBase())
    setTest({ state: 'idle' })
    setError('')
    const timer = setTimeout(() => {
      if (inputRef.current) inputRef.current.focus()
    }, 40)

    // Esc closes · Tab is trapped inside the dialog (focus-trap basics).
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const root = modalRef.current
      if (!root) return
      const focusables = Array.from(root.querySelectorAll(FOCUSABLE)).filter(
        (el) => !el.disabled && el.offsetParent !== null
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [open, onClose])

  if (!open) return null

  const runTest = async () => {
    const clean = normalize(url)
    if (!clean) {
      setError('Enter a valid base URL, for example http://127.0.0.1:8000')
      return
    }
    setError('')
    setTest({ state: 'testing' })
    const result = await pingApi(clean)
    setTest(
      result.ok
        ? { state: 'ok', message: result.message, ms: result.ms }
        : { state: 'fail', message: result.message }
    )
  }

  const handleSave = () => {
    const clean = normalize(url)
    if (!clean) {
      setError('Enter a valid base URL, for example http://127.0.0.1:8000')
      return
    }
    setApiBase(clean)
    if (onSaved) onSaved()
    onClose()
  }

  const handleReset = () => {
    setUrl(DEFAULT_API_BASE)
    setTest({ state: 'idle' })
    setError('')
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Settings" ref={modalRef}>
        <header className="modal-head">
          <h3>Settings</h3>
          <button type="button" className="icon-btn" title="Close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </header>

        <div className="modal-body">
          <div className="field">
            <label className="field-label" htmlFor="api-base">
              Analytics API base URL
            </label>
            <input
              id="api-base"
              ref={inputRef}
              className="input"
              value={url}
              spellCheck={false}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
              placeholder={DEFAULT_API_BASE}
            />
            <span className="field-hint">
              SalesSphere reads all data from this FastAPI server. Default: {DEFAULT_API_BASE}
            </span>
          </div>

          {error ? <p className="test-result test-fail">{error}</p> : null}
          {test.state === 'testing' ? <p className="test-result">Testing connection…</p> : null}
          {test.state === 'ok' ? (
            <p className="test-result test-ok">
              Connected in {test.ms} ms — {test.message}
            </p>
          ) : null}
          {test.state === 'fail' ? (
            <p className="test-result test-fail">Failed: {test.message}</p>
          ) : null}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn" onClick={handleReset}>
            Reset to default
          </button>
          <div className="modal-foot-spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={runTest}
            disabled={test.state === 'testing'}
          >
            Test connection
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
