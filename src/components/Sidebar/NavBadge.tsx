import { formatBadgeCount } from '../../utils/navBadges'

/**
 * Red counter at the end of a sidebar item. Renders nothing for 0 / unknown,
 * so a failed or pending read never shows a made-up number. Fixed height
 * (same as the item's line) → no layout shift when it appears; it may use
 * part of the item's end padding so the longest label stays on one line.
 */
export function NavBadge({ count, label }: { count: number | null | undefined; label: string }) {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null
  return (
    <span
      data-testid="nav-badge"
      aria-label={`${label}: ${count}`}
      title={`${label}: ${count}`}
      className="ms-auto -me-3 shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold leading-5 text-center tabular-nums shadow-sm"
    >
      {/* LTR only inside, so "99+" never renders as "+99" in the RTL sidebar */}
      <span dir="ltr">{formatBadgeCount(count)}</span>
    </span>
  )
}
