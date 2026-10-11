import { useCallback, useEffect, useRef, useState } from 'react'

export const API_BASE_KEY = 'salesphere.apiBase'
export const DEFAULT_API_BASE = 'http://127.0.0.1:8000'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function normalizeBase(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

export function getApiBase() {
  try {
    const raw = window.localStorage.getItem(API_BASE_KEY)
    if (raw && raw.trim()) return normalizeBase(raw)
  } catch (err) {
    // localStorage unavailable — fall through to the default
  }
  return DEFAULT_API_BASE
}

export function setApiBase(url) {
  const clean = normalizeBase(url)
  try {
    if (clean) window.localStorage.setItem(API_BASE_KEY, clean)
    else window.localStorage.removeItem(API_BASE_KEY)
  } catch (err) {
    // ignore storage failures
  }
  return clean
}

function buildUrl(path, params) {
  let query = ''
  if (params) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      search.append(key, String(value))
    })
    query = search.toString()
  }
  return query ? `${path}?${query}` : path
}

async function request(path, { method = 'GET', params, body, timeoutMs } = {}) {
  const base = getApiBase()
  const url = base + buildUrl(path, params)
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs || (method === 'POST' ? 120000 : 20000)
  )

  let response
  try {
    response = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new ApiError(
        `Request to ${path} timed out — the API at ${base} may be busy or offline.`,
        0
      )
    }
    throw new ApiError(
      `Could not reach the analytics API at ${base} (${path}). Check that the backend is running, or update the address in Settings.`,
      0
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      if (payload) {
        detail =
          typeof payload.detail === 'string'
            ? payload.detail
            : JSON.stringify(payload.detail !== undefined ? payload.detail : payload)
      }
    } catch (err) {
      // no JSON body in the error response
    }
    throw new ApiError(
      `API error ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ` on ${path}`}`,
      response.status
    )
  }

  try {
    return await response.json()
  } catch (err) {
    throw new ApiError(`API returned invalid JSON for ${path}.`, 0)
  }
}

export function apiGet(path, params, opts) {
  return request(path, { ...(opts || {}), params })
}

export function apiPost(path, body, opts) {
  return request(path, { ...(opts || {}), body, method: 'POST' })
}

export function apiDelete(path, opts) {
  return request(path, { ...(opts || {}), method: 'DELETE' })
}

// Build the full URL for a path + params (used by download / raw-text helpers).
export function buildApiUrl(path, params) {
  return getApiBase() + buildUrl(path, params)
}

// Fetch a (CSV) endpoint as text — used by the Reports live preview table.
export async function apiGetText(path, params, timeoutMs = 30000) {
  const url = buildApiUrl(path, params)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    throw new ApiError(
      err && err.name === 'AbortError'
        ? `Request to ${path} timed out.`
        : `Could not reach the analytics API at ${getApiBase()} (${path}).`,
      0
    )
  }
  clearTimeout(timer)
  if (!response.ok) {
    throw new ApiError(`API error ${response.status} ${response.statusText} on ${path}`, response.status)
  }
  return response.text()
}

// Trigger a browser download of a GET endpoint (CSV / XLSX attachments).
export async function apiDownload(path, params, fallbackFilename = 'export.csv') {
  const url = buildApiUrl(path, params)
  const response = await fetch(url)
  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      detail = payload && payload.detail ? ` — ${payload.detail}` : ''
    } catch (err) {
      // non-JSON error body
    }
    throw new ApiError(`Download failed (${response.status} ${response.statusText})${detail}`, response.status)
  }
  const blob = await response.blob()
  const header = response.headers.get('Content-Disposition') || ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header)
  const filename = match ? decodeURIComponent(match[1]) : fallbackFilename
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000)
  return filename
}

// Multipart upload with progress (XMLHttpRequest — fetch cannot report upload progress).
export function apiUpload(path, formData, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const base = getApiBase()
    const xhr = new XMLHttpRequest()
    xhr.open('POST', base + path)
    xhr.timeout = 300000

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      let payload = null
      try {
        payload = JSON.parse(xhr.responseText)
      } catch (err) {
        // non-JSON response body
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload)
      } else {
        const detail = payload && payload.detail ? ` — ${typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail)}` : ''
        reject(new ApiError(`Upload failed (${xhr.status} ${xhr.statusText})${detail}`, xhr.status))
      }
    }

    xhr.onerror = () =>
      reject(
        new ApiError(
          `Could not reach the analytics API at ${base} (${path}). Check that the backend is running.`,
          0
        )
      )
    xhr.ontimeout = () => reject(new ApiError('Upload timed out after 5 minutes.', 0))

    xhr.send(formData)
  })
}

export function checkHealth() {
  return apiGet('/api/health', undefined, { timeoutMs: 8000 })
}

// Test a candidate base URL from the Settings modal (does not touch localStorage).
export async function pingApi(base, timeoutMs = 8000) {
  const clean = normalizeBase(base)
  const startedAt = performance.now()
  if (!clean) return { ok: false, message: 'Enter a base URL first.' }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(`${clean}/api/health`, { signal: controller.signal })
    clearTimeout(timer)
    const ms = Math.round(performance.now() - startedAt)
    let info = null
    try {
      info = await response.json()
    } catch (err) {
      // non-JSON body
    }
    if (!response.ok) {
      return { ok: false, message: `HTTP ${response.status} ${response.statusText}`, ms }
    }
    const db = info && info.database ? ` — database: ${info.database}` : ''
    const dbWarn = info && info.database_ok === false ? ' (database not reachable)' : ''
    return { ok: true, message: `Health check passed${db}${dbWarn}`, ms, info }
  } catch (err) {
    const ms = Math.round(performance.now() - startedAt)
    return {
      ok: false,
      message:
        err && err.name === 'AbortError'
          ? `Timed out after ${Math.round(timeoutMs / 1000)}s`
          : 'Connection failed — is the server running?',
      ms,
    }
  }
}

// Small data-loading hook: loading / error / data + retry, re-runs when deps change.
export function useApiData(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fetcherRef
      .current()
      .then((result) => {
        if (alive) {
          setData(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err)
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const retry = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, retry }
}
