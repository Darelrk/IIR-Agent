interface MobileMenuButtonProps {
  isOpen: boolean
  onToggle: () => void
}

/** Floating hamburger button — visible only on mobile (sidebar is fixed off-canvas). */
export function MobileMenuButton({ isOpen, onToggle }: MobileMenuButtonProps) {
  return (
    <button
      className="mobile-menu-btn"
      onClick={onToggle}
      aria-label={isOpen ? 'Tutup sidebar' : 'Buka sidebar'}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isOpen ? (
          <>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </>
        ) : (
          <>
            <path d="M3 6h18" />
            <path d="M3 12h18" />
            <path d="M3 18h18" />
          </>
        )}
      </svg>
    </button>
  )
}
