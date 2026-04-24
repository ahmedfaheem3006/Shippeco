import { create } from 'zustand'
import type { Invoice } from '../utils/models'

type InvoicesState = {
  invoices: Invoice[]
  setInvoices: (invoices: Invoice[]) => void
  upsertInvoice: (invoice: Invoice) => void
  removeInvoice: (id: string) => void
}

export const useInvoicesStore = create<InvoicesState>((set, get) => ({
  invoices: [],
  setInvoices: (invoices) => {
    set({ invoices })
  },
  upsertInvoice: (invoice) => {
    const prev = get().invoices
    const idx = prev.findIndex((i) => String(i.id) === String(invoice.id))
    const next =
      idx === -1
        ? [...prev, invoice]
        : prev.map((i, iIdx) => (iIdx === idx ? invoice : i))
    set({ invoices: next })
  },
  removeInvoice: (id) => {
    const prev = get().invoices
    const next = prev.filter((i) => String(i.id) !== String(id))
    set({ invoices: next })
  },
}))
