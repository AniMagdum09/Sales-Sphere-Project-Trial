import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'
import {
  IconBell,
  IconBox,
  IconChat,
  IconChevronLeft,
  IconDatabase,
  IconGrid,
  IconLightbulb,
  IconReport,
  IconTrending,
  IconUsers,
} from './icons'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', Icon: IconGrid },
  { id: 'insights', label: 'Insights', Icon: IconLightbulb },
  { id: 'sales', label: 'Sales', Icon: IconTrending },
  { id: 'inventory', label: 'Inventory', Icon: IconBox },
  { id: 'customers', label: 'Customers', Icon: IconUsers },
  { id: 'alerts', label: 'Alerts', Icon: IconBell },
  { id: 'reports', label: 'Reports', Icon: IconReport },
  { id: 'import', label: 'Import Data', Icon: IconDatabase },
  { id: 'chatbot', label: 'Chatbot', Icon: IconChat },
]

const APP_VERSION =
  (typeof window !== 'undefined' && window.salesphere && window.salesphere.version) || '2.0.0'

export default function Sidebar({ page, onNavigate, criticalAlerts = 0, collapsed, onToggleCollapsed }) {
  const navRef = useRef(null)
  // Sliding active indicator — measured from the real button offsets so it
  // glides between items instead of being a per-item static class.
  const [pill, setPill] = useState(null)
  // Collapsed-rail tooltip (rendered at the aside level so nav overflow never clips it).
  const [tip, setTip] = useState(null)

  const measurePill = () => {
    const nav = navRef.current
    if (!nav) return
    const btn = nav.querySelector(`.nav-item[data-page="${page}"]`)
    if (btn) setPill({ top: btn.offsetTop, height: btn.offsetHeight })
    else setPill(null)
  }

  useLayoutEffect(measurePill, [page, collapsed])

  useEffect(() => {
    const nav = navRef.current
    if (!nav || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => measurePill())
    ro.observe(nav)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  useEffect(() => {
    if (!collapsed) setTip(null)
  }, [collapsed])

  const showTip = (label) => (e) => {
    if (!collapsed) return
    const nav = navRef.current
    const btn = e.currentTarget
    if (!nav || !btn) return
    const top = nav.offsetTop + btn.offsetTop - nav.scrollTop + btn.offsetHeight / 2
    setTip({ label, top })
  }

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-head">
        <button
          type="button"
          className="brand-mark"
          onClick={collapsed ? onToggleCollapsed : undefined}
          title={collapsed ? 'Expand sidebar' : undefined}
          aria-label={collapsed ? 'Expand sidebar' : 'SalesSphere'}
          tabIndex={collapsed ? 0 : -1}
        >
          <Logo size={34} />
        </button>
        <div className="brand-text" aria-hidden={collapsed || undefined}>
          <div className="brand-name">SalesSphere</div>
          <div className="brand-sub">Retail Analytics</div>
        </div>
        <button
          type="button"
          className="icon-btn head-toggle"
          onClick={onToggleCollapsed}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          aria-hidden={collapsed || undefined}
          tabIndex={collapsed ? -1 : 0}
        >
          <IconChevronLeft size={16} />
        </button>
      </div>

      <nav className="nav" ref={navRef} onMouseLeave={() => setTip(null)}>
        {pill && (
          <span
            className="nav-pill"
            style={{ transform: `translateY(${pill.top}px)`, height: `${pill.height}px` }}
            aria-hidden="true"
          />
        )}
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            data-page={id}
            className={`nav-item${page === id ? ' active' : ''}`}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => {
              setTip(null)
              onNavigate(id)
            }}
            onMouseEnter={showTip(label)}
          >
            <span className="nav-ico">
              <Icon size={17} />
            </span>
            <span className="nav-label">{label}</span>
            {id === 'alerts' && criticalAlerts > 0 && (
              <span className="nav-badge num" title={`${criticalAlerts} critical alert(s)`}>
                {criticalAlerts > 99 ? '99+' : criticalAlerts}
              </span>
            )}
          </button>
        ))}
      </nav>

      {collapsed && tip && (
        <span className="rail-tip" style={{ top: tip.top }} role="tooltip">
          {tip.label}
        </span>
      )}

      <div className="sidebar-foot">
        <div className="sidebar-foot-row">
          <ThemeToggle />
          <div className="sidebar-foot-version" aria-hidden={collapsed || undefined}>
            <span>SalesSphere Desktop v{APP_VERSION}</span>
            <span className="sidebar-foot-dim">Offline analytics · local API</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
