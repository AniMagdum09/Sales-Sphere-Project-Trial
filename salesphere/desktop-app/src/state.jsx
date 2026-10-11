import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from './api'

// ============================================================
// Theme
// ============================================================

export const THEME_KEY = 'salesphere.theme'

function readInitialTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch (err) {
    // localStorage unavailable — fall through to the default
  }
  // Fall back to whatever the boot script in index.html already applied.
  if (typeof document !== 'undefined' && document.documentElement) {
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'light') return 'light'
  }
  return 'dark'
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      window.localStorage.setItem(THEME_KEY, theme)
    } catch (err) {
      // ignore storage failures
    }
  }, [theme])

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    []
  )

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

// ============================================================
// Chart palette — reads the current theme, used by every chart.
// ============================================================

export const SERIES_DARK = ['#10B981', '#22D3EE', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899']
export const SERIES_LIGHT = ['#059669', '#0891B2', '#2563EB', '#7C3AED', '#D97706', '#DB2777']

export function useChartTheme() {
  const { theme } = useTheme()
  const dark = theme !== 'light'
  return useMemo(
    () =>
      dark
        ? {
            theme: 'dark',
            series: SERIES_DARK,
            accent: '#10B981',
            accent2: '#22D3EE',
            blue: '#3B82F6',
            violet: '#8B5CF6',
            amber: '#F59E0B',
            red: '#EF4444',
            pink: '#EC4899',
            grid: '#1F2A44',
            text: '#E6ECF8',
            muted: '#8B96B3',
            cursor: 'rgba(139, 150, 179, 0.35)',
            hoverFill: 'rgba(139, 150, 179, 0.08)',
            tooltipBg: '#0F1629',
            tooltipBorder: '#1F2A44',
          }
        : {
            theme: 'light',
            series: SERIES_LIGHT,
            accent: '#059669',
            accent2: '#0891B2',
            blue: '#2563EB',
            violet: '#7C3AED',
            amber: '#D97706',
            red: '#DC2626',
            pink: '#DB2777',
            grid: '#E3E8F2',
            text: '#0F172A',
            muted: '#55647F',
            cursor: 'rgba(91, 107, 133, 0.35)',
            hoverFill: 'rgba(91, 107, 133, 0.08)',
            tooltipBg: '#FFFFFF',
            tooltipBorder: '#E3E8F2',
          },
    [dark]
  )
}

// ============================================================
// Filters — global branch + date-range, persisted.
// ============================================================

export const FILTERS_KEY = 'salesphere.filters'

export const BRANCHES = [
  { id: 'all', label: 'All branches' },
  { id: '01', label: '01 Sports Main' },
  { id: '02', label: '02 Garments 1' },
  { id: '03', label: '03 Garments 2' },
]

export const RANGES = [
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
  { id: '12m', label: '12M', days: 365 },
  { id: 'all', label: 'All', days: null },
]

export const DEFAULT_FILTERS = { branch: 'all', range: 'all' }

function readInitialFilters() {
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const branch = BRANCHES.some((b) => b.id === parsed.branch) ? parsed.branch : 'all'
      const range = RANGES.some((r) => r.id === parsed.range) ? parsed.range : 'all'
      return { branch, range }
    }
  } catch (err) {
    // corrupted or unavailable storage — use defaults
  }
  return { ...DEFAULT_FILTERS }
}

function isoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// '7d' | '30d' | '90d' | '12m' -> {from,to}; 'all' -> {} (omit)
export function rangeToParams(range) {
  const def = RANGES.find((r) => r.id === range) || RANGES[4]
  if (def.days == null) return {}
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - def.days)
  return { from: isoDate(from), to: isoDate(to) }
}

export function rangeLabel(range) {
  const def = RANGES.find((r) => r.id === range) || RANGES[4]
  if (def.days == null) return 'All time'
  if (def.id === '12m') return 'Last 12 months'
  return `Last ${def.days} days`
}

const FilterContext = createContext(null)

export function FilterProvider({ children }) {
  const [filters, setFilters] = useState(readInitialFilters)

  useEffect(() => {
    try {
      window.localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
    } catch (err) {
      // ignore storage failures
    }
  }, [filters])

  const setBranch = useCallback(
    (branch) => setFilters((f) => ({ ...f, branch: BRANCHES.some((b) => b.id === branch) ? branch : 'all' })),
    []
  )
  const setRange = useCallback(
    (range) => setFilters((f) => ({ ...f, range: RANGES.some((r) => r.id === range) ? range : 'all' })),
    []
  )

  // Merge the active filters into query params: branch (unless all) + from/to.
  const apiParams = useCallback(
    (extra) => ({
      ...(filters.branch !== 'all' ? { branch: filters.branch } : {}),
      ...rangeToParams(filters.range),
      ...(extra || {}),
    }),
    [filters]
  )

  const value = useMemo(
    () => ({ filters, setBranch, setRange, apiParams }),
    [filters, setBranch, setRange, apiParams]
  )
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export function useFilters() {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilters must be used inside <FilterProvider>')
  return ctx
}

// ============================================================
// Toasts — tiny custom notification system (bottom-right).
// ============================================================

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (kind, message, title) => {
      const id = ++idRef.current
      setToasts((list) => [...list.slice(-4), { id, kind, message: String(message || ''), title }])
      window.setTimeout(() => dismiss(id), 4000)
      return id
    },
    [dismiss]
  )

  const api = useMemo(
    () => ({
      success: (message, title) => push('success', message, title),
      error: (message, title) => push('error', message, title),
      info: (message, title) => push('info', message, title),
    }),
    [push]
  )

  const value = useMemo(() => ({ toasts, dismiss, ...api }), [toasts, dismiss, api])
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

// ============================================================
// Data presence — one shared check so every page knows whether
// the database actually has invoices (fresh-start onboarding).
// hasData: null = still checking, true = data exists,
//          false = total_invoices === 0 (render onboarding/empty states).
// ============================================================

const DataContext = createContext({ hasData: null, checking: true, refresh: () => {} })

export function DataProvider({ children }) {
  const [hasData, setHasData] = useState(null)
  const [checking, setChecking] = useState(true)

  const check = useCallback(async () => {
    setChecking(true)
    try {
      const d = await apiGet('/api/overview', undefined, { timeoutMs: 15000 })
      setHasData(Number(d && d.total_invoices) > 0)
    } catch (err) {
      // API unreachable — assume data exists so pages render their normal
      // (error banner) flows instead of onboarding screens.
      setHasData(true)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    check()
  }, [check])

  const value = useMemo(() => ({ hasData, checking, refresh: check }), [hasData, checking, check])
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useHasData() {
  return useContext(DataContext)
}

// ============================================================
// Navigation context — lets deep components jump between pages
// without prop-drilling onNavigate through every level.
// ============================================================

const NavContext = createContext(() => {})

export function NavProvider({ value, children }) {
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useNav() {
  return useContext(NavContext)
}
