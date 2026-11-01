import { formatBadgeCount } from '../../utils/navBadges'

/**
 * Red counter at the end of a sidebar item. Renders nothing for 0 / unknown,
 * so a failed or pending read never shows a made-up number. Fixed height
 * (same as the item's line) → no layout shift when it appears; it may use
 * part of the item's end padding so the longest label stays on one line.
 */
export function NavBadge({ count, label, variant = 'count' }: { count: number | null | undefined; label: string; variant?: 'count' | 'chat' }) {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null
  const chat = variant === 'chat'
  return (
    <span
      data-testid={chat ? 'nav-badge-chat' : 'nav-badge'}
      aria-label={`${label}: ${count}`}
      title={`${label}: ${count}`}
      className={chat
        // Unread task discussions: rose + chat icon, so it reads differently from the red "open tasks" counter next to it.
        ? 'shrink-0 inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200 text-[11px] font-bold leading-5 tabular-nums ring-1 ring-rose-300 dark:ring-rose-800'
        : 'ms-auto -me-3 shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold leading-5 text-center tabular-nums shadow-sm'}
    >
      {chat && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      )}
      {/* LTR only inside, so "99+" never renders as "+99" in the RTL sidebar */}
      <span dir="ltr">{formatBadgeCount(count)}</span>
    </span>
  )
}
