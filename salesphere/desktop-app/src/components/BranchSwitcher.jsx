import { useEffect, useRef, useState } from 'react'
import { BRANCHES, useFilters } from '../state'
import { IconCheck, IconChevronDown, IconStore } from './icons'

export default function BranchSwitcher() {
  const { filters, setBranch } = useFilters()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = BRANCHES.find((b) => b.id === filters.branch) || BRANCHES[0]

  return (
    <div className="branch-switcher" ref={rootRef}>
      <button
        type="button"
        className="branch-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Filter all data by branch"
        onClick={() => setOpen((o) => !o)}
      >
        <IconStore size={14} />
        <span className="branch-btn-label">{current.label}</span>
        <IconChevronDown size={13} className={open ? 'spin-180' : undefined} />
      </button>
      {open && (
        <div className="branch-menu" role="listbox" aria-label="Branch">
          {BRANCHES.map((b) => (
            <button
              key={b.id}
              type="button"
              role="option"
              aria-selected={b.id === filters.branch}
              className={`branch-option${b.id === filters.branch ? ' selected' : ''}`}
              onClick={() => {
                setBranch(b.id)
                setOpen(false)
              }}
            >
              <span>{b.label}</span>
              {b.id === filters.branch && <IconCheck size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
