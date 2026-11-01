import { MessageCircle } from 'lucide-react';
import { unreadRepliesLabel } from './taskUtils';

/**
 * «💬 3 رسائل جديدة» on a task card: replies on its discussion the signed-in
 * user has not read (computed by the server). Solid colour + icon + text, so
 * it never depends on colour alone and stands out on light and dark cards.
 * A button: opens the task window at the first unread reply.
 */
export function TaskUnreadBadge({ count, onOpen, className = '' }: { count: number | undefined; onOpen: () => void; className?: string }) {
  if (!count || count <= 0) return null;
  const label = unreadRepliesLabel(count);
  return (
    <button
      type="button"
      data-testid="task-unread-badge"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`${label} غير مقروءة — فتح المناقشة`}
      title={`${label} غير مقروءة`}
      className={`relative shrink-0 inline-flex items-center gap-1.5 min-h-[32px] px-3 py-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black whitespace-nowrap shadow-md shadow-rose-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 ${className}`}
    >
      <span className="absolute -top-0.5 -end-0.5 flex h-2.5 w-2.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white ring-2 ring-rose-600" />
      </span>
      <MessageCircle size={13} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
