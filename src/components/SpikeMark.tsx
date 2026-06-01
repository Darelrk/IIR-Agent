interface SpikeMarkProps {
  size?: number
  color?: string
  className?: string
}

/**
 * Anthropic-inspired spike-mark glyph: 4-spoke radial asterisk.
 * Used as brand wordmark prefix and content marker.
 */
export function SpikeMark({ size = 16, color = 'currentColor', className }: SpikeMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* 4-spoke radial — vertical, horizontal, two diagonals */}
      <path
        d="M12 2L12 22"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M2 12L22 12"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M5 5L19 19"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M19 5L5 19"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
