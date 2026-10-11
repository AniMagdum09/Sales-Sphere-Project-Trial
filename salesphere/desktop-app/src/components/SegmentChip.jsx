// RFM segment chip — color-coded per segment family.
const SEGMENT_STYLES = {
  Champions: 'badge-green',
  Loyal: 'badge-blue',
  'At Risk': 'badge-amber',
  New: 'badge-cyan',
  Hibernating: 'badge-muted',
}

export default function SegmentChip({ segment }) {
  const cls = SEGMENT_STYLES[segment] || 'badge-muted'
  return <span className={`badge ${cls}`}>{segment || 'Unknown'}</span>
}
