import { useEffect, useRef, useState } from 'react'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// 1234567 -> "12,34,567" (en-IN grouping)
export function formatNumber(value, decimals = 0) {
  const n = toNumber(value)
  if (n === null) return '—'
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

// 450000 -> "₹4,50,000"
export function formatCurrency(value, decimals = 0) {
  const n = toNumber(value)
  if (n === null) return '—'
  return `₹${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)}`
}

// Quantities may be fractional (e.g. 119.5) — up to 1 decimal, trailing .0 trimmed.
export function formatQty(value) {
  const n = toNumber(value)
  if (n === null) return '—'
  const rounded = Math.round(n * 10) / 10
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(rounded)
}

// Compact Indian notation for chart axes / labels: ₹1.4Cr, ₹36L, ₹45.0K
export function formatLakhCompact(value) {
  const n = toNumber(value)
  if (n === null) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  const trim = (x) => {
    const r = Math.round(x * 10) / 10
    return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1)
  }
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`
  return `${sign}₹${trim(abs)}`
}

// Back-compatible alias.
export const formatCompactINR = formatLakhCompact

// 3.42 -> "+3.4%", -1.8 -> "−1.8%"
export function formatPercent(value, digits = 1) {
  const n = toNumber(value)
  if (n === null) return '—'
  const sign = n >= 0 ? '+' : '−'
  return `${sign}${Math.abs(n).toFixed(digits)}%`
}

function parseParts(value) {
  if (!value) return null
  const s = String(value).slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return { y: m[1], mIndex: Number(m[2]) - 1, d: m[3] }
}

// "2026-10-02" -> "02 Oct 2026"
export function formatDate(value) {
  const p = parseParts(value)
  if (!p) return value ? String(value) : '—'
  const month = MONTHS_SHORT[p.mIndex]
  return month ? `${p.d} ${month} ${p.y}` : String(value)
}

// "2025-08" -> "Aug 2025"
export function formatMonth(value) {
  if (!value) return '—'
  const s = String(value)
  const m = /^(\d{4})-(\d{2})/.exec(s)
  if (!m) return s
  const month = MONTHS_SHORT[Number(m[2]) - 1]
  return month ? `${month} ${m[1]}` : s
}

// "2025-08" -> "Aug 25" (compact axis label)
export function formatMonthShort(value) {
  if (!value) return '—'
  const s = String(value)
  const m = /^(\d{4})-(\d{2})/.exec(s)
  if (!m) return s
  const month = MONTHS_SHORT[Number(m[2]) - 1]
  return month ? `${month} ${String(m[1]).slice(2)}` : s
}

// "2026-09-01" -> "01 Sep"
export function formatDayShort(value) {
  const p = parseParts(value)
  if (!p) return value ? String(value) : '—'
  const month = MONTHS_SHORT[p.mIndex]
  return month ? `${p.d} ${month}` : String(value)
}

// "2026-10-10T12:00:00" -> "10 Oct 2026, 12:00"
export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`
}

export function truncate(value, max = 20) {
  const s = value === null || value === undefined ? '' : String(value)
  if (s.length > max) return `${s.slice(0, Math.max(0, max - 1))}…`
  return s || '—'
}

// ============================================================
// Motion preference + count-up hook (used by KPI stat cards)
// ============================================================

export function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  } catch (err) {
    return false
  }
}

// Animate a number from its previous value up to `target` over ~900ms with an
// ease-out curve. Returns null when the target itself is null (caller renders
// an em-dash). Respects prefers-reduced-motion by jumping straight to the value.
export function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(() => (target == null ? null : 0))
  const rafRef = useRef(0)
  const prevRef = useRef(0)

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (target == null) {
      prevRef.current = 0
      setValue(null)
      return undefined
    }
    if (prefersReducedMotion()) {
      prevRef.current = target
      setValue(target)
      return undefined
    }
    const from = Number(prevRef.current) || 0
    prevRef.current = target
    const startedAt = performance.now()
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
    const step = (now) => {
      const p = Math.min(1, (now - startedAt) / duration)
      setValue(from + (target - from) * easeOutCubic(p))
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return value
}
