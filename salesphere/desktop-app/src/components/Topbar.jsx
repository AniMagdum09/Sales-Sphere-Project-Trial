import BranchSwitcher from './BranchSwitcher'
import RangeChips from './RangeChips'
import ThemeToggle from './ThemeToggle'
import { IconMenu, IconRefresh, IconSettings } from './icons'
import { getApiBase } from '../api'

export default function Topbar({
  title,
  subtitle,
  health,
  onRefresh,
  onOpenSettings,
  onToggleSidebar,
  sidebarCollapsed,
}) {
  const state = health.state
  const pillClass = state === 'up' ? 'dot-up' : state === 'down' ? 'dot-down' : 'dot-wait'
  const label =
    state === 'up' ? 'API connected' : state === 'down' ? 'API offline' : 'Checking API…'
  const info = health.info
  const tip = `API base: ${getApiBase()}${
    info && info.database ? ` — database: ${info.database}` : ''
  }`

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn topbar-menu"
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label="Toggle sidebar"
        onClick={onToggleSidebar}
      >
        <IconMenu size={16} />
      </button>
      <div className="topbar-heading">
        <h1 className="topbar-title">{title}</h1>
        {subtitle ? <span className="topbar-subtitle">{subtitle}</span> : null}
      </div>
      <div className="topbar-right">
        <BranchSwitcher />
        <RangeChips />
        <span className="topbar-divider" />
        <div className={`health-pill ${pillClass}`} title={tip}>
          <span className="health-dot" />
          <span>{label}</span>
        </div>
        <button type="button" className="icon-btn" title="Refresh data" onClick={onRefresh}>
          <IconRefresh size={16} />
        </button>
        <ThemeToggle />
        <button type="button" className="icon-btn" title="Settings" onClick={onOpenSettings}>
          <IconSettings size={16} />
        </button>
      </div>
    </header>
  )
}
