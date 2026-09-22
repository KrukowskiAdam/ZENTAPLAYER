// A few glyphs Iconly doesn't ship (pause, disc, stop) — hand-drawn to match its
// visual language exactly: 24x24 viewBox, 1.5 stroke, round caps/joins, no fill.
interface IconProps {
  size?: number
  color?: string
}

export function Play({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 5.5c0-1.19 1.31-1.91 2.31-1.27l9.5 6.5a1.5 1.5 0 0 1 0 2.54l-9.5 6.5C8.31 20.41 7 19.69 7 18.5v-13Z" fill={color} />
    </svg>
  )
}

export function Pause({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="5" width="4" height="14" rx="1.2" fill={color} />
      <rect x="14" y="5" width="4" height="14" rx="1.2" fill={color} />
    </svg>
  )
}

export function Stop({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="5" width="14" height="14" rx="2" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

export function Disc({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8" stroke={color} strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}
