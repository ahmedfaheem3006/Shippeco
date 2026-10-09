/** "99+" above 99, the number otherwise. */
export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}
