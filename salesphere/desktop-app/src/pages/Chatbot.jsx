import { useEffect, useRef, useState } from 'react'
import { apiPost } from '../api'
import { useHasData } from '../state'
import { formatCurrency, formatNumber } from '../format'
import { IconSend, IconX } from '../components/icons'

const SUGGESTED_QUESTIONS = [
  'What was my total sales last month?',
  'Which items are low in stock?',
  'Show top 5 customers',
  'Compare monthly sales of this year vs last year',
  'Which supplier did I purchase from most?',
  'How many bills were more than ₹10,000?',
]

const MAX_HISTORY = 6

const MONEY_HINTS = ['revenue', 'amount', 'sales', 'total', 'price', 'cost', 'profit', 'value', 'bill', 'spend']
const QTY_HINTS = ['qty', 'quantity', 'count', 'invoice', 'order', 'items', 'stock', 'bills']

function greetingText(hasData) {
  return hasData === false
    ? 'Welcome to SalesSphere! Your database looks empty right now — import your billing data on the Import page, then ask me anything about it.'
    : 'Hello! Ask me anything about your SalesSphere data — sales trends, inventory health, top customers or branch performance.'
}

function formatTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ------------------------------------------------------------------
// Markdown-lite renderer: **bold**, "- " bullet lists and line breaks.
// Builds React nodes — no HTML injection.
// ------------------------------------------------------------------

function renderInline(text, keyBase) {
  const parts = String(text).split(/\*\*(.+?)\*\*/g)
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={`${keyBase}-b${i}`}>{p}</strong> : <span key={`${keyBase}-s${i}`}>{p}</span>
  )
}

function MarkdownLite({ text }) {
  const lines = String(text || '').split('\n')
  const blocks = []
  let list = null
  lines.forEach((line, i) => {
    const bullet = /^\s*[-*•]\s+/.exec(line)
    if (bullet) {
      if (!list) {
        list = []
        blocks.push({ type: 'ul', items: list, key: `ul${i}` })
      }
      list.push(line.slice(bullet[0].length))
      return
    }
    list = null
    if (line.trim() === '') {
      blocks.push({ type: 'gap', key: `gap${i}` })
      return
    }
    blocks.push({ type: 'p', text: line, key: `p${i}` })
  })
  return blocks.map((b) => {
    if (b.type === 'ul') {
      return (
        <ul key={b.key} className="md-ul">
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it, `${b.key}-${j}`)}</li>
          ))}
        </ul>
      )
    }
    if (b.type === 'gap') return <div key={b.key} className="md-gap" />
    return (
      <p key={b.key} className="md-p">
        {renderInline(b.text, b.key)}
      </p>
    )
  })
}

// ------------------------------------------------------------------
// Reply data table: header + up to 10 rows, scrollable, "N more" note.
// ------------------------------------------------------------------

function cellText(value, column) {
  if (value == null || value === '') return '—'
  const col = String(column || '').toLowerCase()
  const n = Number(value)
  if (Number.isFinite(n) && String(value).trim() !== '') {
    const isInt = Number.isInteger(n)
    if (MONEY_HINTS.some((h) => col.includes(h))) return formatCurrency(n, isInt ? 0 : 2)
    if (QTY_HINTS.some((h) => col.includes(h))) return formatNumber(n, isInt ? 0 : 1)
    return isInt ? formatNumber(n) : String(value)
  }
  return String(value)
}

function ReplyTable({ rows }) {
  const columns = Array.isArray(rows.columns) ? rows.columns : []
  const data = Array.isArray(rows.rows) ? rows.rows : []
  if (columns.length === 0 || data.length === 0) return null
  const shown = data.slice(0, 10)
  const more = data.length - shown.length
  return (
    <div className="msg-table">
      <div className="table-wrap msg-table-scroll">
        <table className="data-table msg-data-table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i}>{c == null || c === '' ? '—' : String(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, ri) => (
              <tr key={ri}>
                {columns.map((c, ci) => {
                  const v = r && r[ci]
                  const numeric = v != null && v !== '' && Number.isFinite(Number(v))
                  return (
                    <td key={ci} className={numeric ? 'td-right num' : undefined}>
                      {cellText(v, c)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more > 0 && <p className="msg-table-more">…and {formatNumber(more)} more row(s)</p>}
    </div>
  )
}

function ModeBadge({ message }) {
  if (message.role !== 'assistant' || message.isError || !message.mode) return null
  if (message.mode === 'rules') {
    return <span className="badge badge-amber">Rules</span>
  }
  return <span className="badge badge-cyan">AI · {message.model || 'local model'}</span>
}

function MessageBubble({ m }) {
  const isUser = m.role === 'user'
  const elapsedLabel =
    !isUser && !m.isError && m.elapsedMs != null && Number.isFinite(Number(m.elapsedMs))
      ? `answered in ${(Number(m.elapsedMs) / 1000).toFixed(1)}s`
      : null
  return (
    <div className={`msg ${isUser ? 'msg-user' : 'msg-assistant'}${m.isError ? ' msg-error' : ''}`}>
      {isUser ? (
        <div className="msg-text">{m.text}</div>
      ) : (
        <>
          <MarkdownLite text={m.text} />
          {m.rows && <ReplyTable rows={m.rows} />}
          {m.sql && (
            <details className="msg-sql">
              <summary>SQL used</summary>
              <pre>{m.sql}</pre>
            </details>
          )}
          {!m.isError && (
            <div className="msg-meta">
              <ModeBadge message={m} />
              <span className="msg-time">{formatTime(m.time)}</span>
              {elapsedLabel ? <span className="msg-elapsed num">{elapsedLabel}</span> : null}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function Chatbot() {
  const { hasData } = useHasData()
  const [messages, setMessages] = useState(() => [
    { role: 'assistant', text: greetingText(null), time: Date.now() },
  ])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const listRef = useRef(null)
  const greetAdjustedRef = useRef(false)

  // Adapt the greeting if the database is empty (fresh start).
  useEffect(() => {
    if (hasData === false && !greetAdjustedRef.current) {
      greetAdjustedRef.current = true
      setMessages((prev) =>
        prev.length === 1 && prev[0].role === 'assistant'
          ? [{ role: 'assistant', text: greetingText(false), time: Date.now() }]
          : prev
      )
    }
  }, [hasData])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending])

  // Elapsed-seconds counter for the single "Thinking…" phase (one LLM call,
  // typically well under 25s on the local backend).
  useEffect(() => {
    if (!pending) return undefined
    setElapsed(0)
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [pending])

  const clearChat = () => {
    if (pending) return
    greetAdjustedRef.current = false
    setMessages([{ role: 'assistant', text: greetingText(hasData), time: Date.now() }])
    setInput('')
  }

  const send = async (preset) => {
    const question = String(preset != null ? preset : input).trim()
    if (!question || pending) return
    setInput('')
    const history = messages
      .filter((m) => !m.isError && m.text)
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.text }))
    setMessages((prev) => [...prev, { role: 'user', text: question, time: Date.now() }])
    setPending(true)
    try {
      const res = await apiPost('/api/chat', { question, history })
      const rows =
        res && res.rows && Array.isArray(res.rows.rows) && res.rows.rows.length > 0 ? res.rows : null
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res && res.answer != null ? String(res.answer) : 'The API returned an empty answer.',
          mode: res && res.mode,
          model: res && res.model,
          sql: res && res.sql ? String(res.sql) : null,
          rows,
          elapsedMs: res && res.elapsed_ms != null ? Number(res.elapsed_ms) : null,
          time: Date.now(),
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: err && err.message ? err.message : 'Request failed.',
          isError: true,
          time: Date.now(),
        },
      ])
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="page-chat">
      <div className="chat-suggest-row">
        <div className="chip-row chat-chips">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button key={q} type="button" className="chip" disabled={pending} onClick={() => send(q)}>
              {q}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-sm chat-clear" onClick={clearChat} disabled={pending}>
          <IconX size={13} />
          Clear chat
        </button>
      </div>

      <div className="chat-messages" ref={listRef}>
        <div className="chat-thread">
          {messages.map((m, i) => (
            <MessageBubble key={i} m={m} />
          ))}
          {pending && (
            <div className="msg msg-assistant msg-typing">
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
              <span className="typing-elapsed num">Thinking… {elapsed}s</span>
            </div>
          )}
        </div>
      </div>

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          className="chat-input"
          value={input}
          placeholder={pending ? 'Thinking… you can type your next question' : 'Ask a question about your retail data…'}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-send" disabled={pending || !input.trim()}>
          <IconSend size={15} />
          Send
        </button>
      </form>
    </div>
  )
}
