// Brand logo mark: rounded square, emerald->cyan gradient, bar-chart glyph.
export default function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="sp-logo-grad" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="10" fill="url(#sp-logo-grad)" />
      <rect
        x="10.5"
        y="21"
        width="4.6"
        height="9"
        rx="1.6"
        fill="#FFFFFF"
        fillOpacity="0.95"
      />
      <rect
        x="17.7"
        y="14"
        width="4.6"
        height="16"
        rx="1.6"
        fill="#FFFFFF"
        fillOpacity="0.95"
      />
      <rect
        x="24.9"
        y="9"
        width="4.6"
        height="21"
        rx="1.6"
        fill="#FFFFFF"
        fillOpacity="0.95"
      />
    </svg>
  )
}
