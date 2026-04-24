import { useEffect, useId, useMemo, useRef } from 'react'
import styles from './InvoiceRowMenu.module.css'

type Item = {
  label: string
  action: string
  tone?: 'default' | 'danger'
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction: (action: string) => void
  items: Item[]
}

export function InvoiceRowMenu({ open, onOpenChange, onAction, items }: Props) {
  const btnId = useId()
  const menuId = useMemo(() => `${btnId}-menu`, [btnId])
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: PointerEvent) => {
      const el = rootRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      onOpenChange(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <div className={styles.wrap} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="invoice-row-menu"
        data-testid="invoice-row-menu-trigger"
        onClick={() => onOpenChange(!open)}
      >
        ⋯
      </button>
      {open ? (
        <div className={styles.menu} id={menuId} role="menu">
          {items.map((it) => (
            <button
              key={it.action}
              type="button"
              role="menuitem"
              className={[styles.item, it.tone === 'danger' ? styles.danger : undefined]
                .filter(Boolean)
                .join(' ')}
              aria-label={it.label}
              data-action={it.action}
              data-testid={`invoice-row-menu-item-${it.action}`}
              onClick={() => {
                onOpenChange(false)
                onAction(it.action)
              }}
            >
              <span>{it.label}</span>
              <span style={{ opacity: 0.7 }}>‹</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
