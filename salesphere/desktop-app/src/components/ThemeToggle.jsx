import { useTheme } from '../state'
import { IconMoon, IconSun } from './icons'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const dark = theme !== 'light'
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggleTheme}
    >
      {dark ? (
        <IconSun key="sun" size={16} />
      ) : (
        <IconMoon key="moon" size={16} />
      )}
    </button>
  )
}
