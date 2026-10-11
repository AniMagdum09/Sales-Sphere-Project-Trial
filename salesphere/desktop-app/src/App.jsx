import { useCallback, useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import SettingsModal from './components/SettingsModal'
import ToastHost from './components/Toast'
import { checkHealth, apiGet } from './api'
import { DataProvider, FilterProvider, NavProvider, ThemeProvider } from './state'
import Overview from './pages/Overview'
import Insights from './pages/Insights'
import Sales from './pages/Sales'
import Inventory from './pages/Inventory'
import Customers from './pages/Customers'
import Alerts from './pages/Alerts'
import Reports from './pages/Reports'
import ImportData from './pages/ImportData'
import Chatbot from './pages/Chatbot'

const PAGE_TITLES = {
  overview: 'Overview',
  insights: 'Insights',
  sales: 'Sales',
  inventory: 'Inventory',
  customers: 'Customers',
  alerts: 'Alerts',
  reports: 'Reports',
  import: 'Import Data',
  chatbot: 'Chatbot',
}

const PAGE_SUBTITLES = {
  overview: 'Business health at a glance',
  insights: 'Profit, demand and customer intelligence',
  sales: 'Revenue, products and customers',
  inventory: 'Stock health and reorder planning',
  customers: 'Segments and purchase behaviour',
  alerts: 'Signals that need attention',
  reports: 'Exports and printable summaries',
  import: 'Bring your data into SalesSphere',
  chatbot: 'Ask questions about your data',
}

const SIDEBAR_KEY = 'salesphere.sidebar'

function readSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch (err) {
    return false
  }
}

function Shell() {
  const [page, setPage] = useState('overview')
  const [pageState, setPageState] = useState({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [health, setHealth] = useState({ state: 'checking', info: null })
  const [criticalAlerts, setCriticalAlerts] = useState(0)
  const [inventorySearch, setInventorySearch] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed)

  // Persist the collapsed state so the layout survives restarts.
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0')
    } catch (err) {
      // ignore storage failures
    }
  }, [sidebarCollapsed])

  const toggleSidebar = useCallback(() => setSidebarCollapsed((c) => !c), [])

  const pollHealth = useCallback(async () => {
    try {
      const info = await checkHealth()
      const ok = info && info.status === 'ok' && info.database_ok !== false
      setHealth({ state: ok ? 'up' : 'down', info })
    } catch (err) {
      setHealth({ state: 'down', info: null })
    }
  }, [])

  // Poll alerts for the sidebar badge (critical count), every 60s.
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const data = await apiGet('/api/insights/alerts')
        if (!alive) return
        const list = (data && data.alerts) || []
        setCriticalAlerts(list.filter((a) => a && a.severity === 'critical').length)
      } catch (err) {
        if (alive) setCriticalAlerts(0)
      }
    }
    load()
    const timer = setInterval(load, 60000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [refreshToken])

  useEffect(() => {
    pollHealth()
    const timer = setInterval(pollHealth, 30000)
    return () => clearInterval(timer)
  }, [pollHealth])

  const handleRefresh = useCallback(() => {
    setRefreshToken((t) => t + 1)
    pollHealth()
  }, [pollHealth])

  const navigate = useCallback((target, state) => {
    setPage(target)
    setPageState(state || {})
    if (target === 'inventory' && state && state.search != null) {
      setInventorySearch(String(state.search))
    }
  }, [])

  const content = useMemo(() => {
    switch (page) {
      case 'overview':
        return <Overview refreshToken={refreshToken} onNavigate={navigate} />
      case 'insights':
        return <Insights refreshToken={refreshToken} />
      case 'sales':
        return <Sales refreshToken={refreshToken} />
      case 'inventory':
        return (
          <Inventory
            refreshToken={refreshToken}
            initialSearch={pageState.search != null ? String(pageState.search) : undefined}
          />
        )
      case 'customers':
        return <Customers refreshToken={refreshToken} />
      case 'alerts':
        return <Alerts onOpenItem={(code) => navigate('inventory', { search: code })} />
      case 'reports':
        return <Reports />
      case 'import':
        return <ImportData />
      case 'chatbot':
        return <Chatbot />
      default:
        return null
    }
  }, [page, refreshToken, navigate, pageState])

  return (
    <NavProvider value={navigate}>
      <div className="app" data-page={page}>
        <div className="aurora" aria-hidden="true">
          <span className="aurora-a" />
          <span className="aurora-b" />
          <span className="aurora-c" />
        </div>
        <Sidebar
          page={page}
          onNavigate={navigate}
          criticalAlerts={criticalAlerts}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />
        <div className="main">
          <Topbar
            title={PAGE_TITLES[page] || 'SalesSphere'}
            subtitle={PAGE_SUBTITLES[page]}
            health={health}
            onRefresh={handleRefresh}
            onOpenSettings={() => setSettingsOpen(true)}
            onToggleSidebar={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <main className={`content${page === 'chatbot' ? ' content-chat' : ''}`}>
            <div key={page} className={`page-host${page === 'chatbot' ? ' page-host-chat' : ''}`}>
              {content}
            </div>
          </main>
        </div>
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={pollHealth} />
      </div>
    </NavProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <DataProvider>
        <FilterProvider>
          <ToastHost>
            <Shell />
          </ToastHost>
        </FilterProvider>
      </DataProvider>
    </ThemeProvider>
  )
}
