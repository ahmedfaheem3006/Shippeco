import { create } from 'zustand'
import type { InvoiceTemplate, PlatformSettings } from '../utils/models'
import { readJson, storageKeys, writeJson } from '../utils/storage'

type SettingsState = {
  settings: PlatformSettings
  invoiceTemplate: InvoiceTemplate
  setSettings: (partial: Partial<PlatformSettings>) => void
  setInvoiceTemplate: (partial: Partial<InvoiceTemplate>) => void
}

const defaultSettings: PlatformSettings = {
  currency: 'PL',
  invoiceNote: '',
  storeWA: '',
}

const defaultInvoiceTemplate: InvoiceTemplate = {
  companyAr: 'التكامل التقني الدولي',
  companyEn: 'Altakamul Altaqnii Alduwalii',
  vat: '',
  cr: '',
  phone: '',
  email: '',
  address: '',
  note: '',
}

function loadSettings(): PlatformSettings {
  if (typeof localStorage === 'undefined') return defaultSettings
  const saved = readJson<Partial<PlatformSettings>>(storageKeys.settings, localStorage)
  return { ...defaultSettings, ...(saved ?? {}) }
}

function loadInvoiceTemplate(): InvoiceTemplate {
  if (typeof localStorage === 'undefined') return defaultInvoiceTemplate
  const saved = readJson<Partial<InvoiceTemplate>>(storageKeys.invoiceTemplate, localStorage)
  return { ...defaultInvoiceTemplate, ...(saved ?? {}) }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: loadSettings(),
  invoiceTemplate: loadInvoiceTemplate(),
  setSettings: (partial) => {
    const next = { ...get().settings, ...partial }
    if (typeof localStorage !== 'undefined') {
      writeJson(storageKeys.settings, next, localStorage)
    }
    set({ settings: next })
  },
  setInvoiceTemplate: (partial) => {
    const next = { ...get().invoiceTemplate, ...partial }
    if (typeof localStorage !== 'undefined') {
      writeJson(storageKeys.invoiceTemplate, next, localStorage)
    }
    set({ invoiceTemplate: next })
  },
}))
