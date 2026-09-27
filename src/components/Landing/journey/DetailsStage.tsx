import { useState, type RefObject } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Plus, Trash2, Info } from 'lucide-react'
import { JOURNEY } from '../../../content/landingPageContent'
import { collapseMotion, DURATION, useMotionTransition } from '../motion'
import { NumberUnitField } from './fields'
import {
  MAX_PACKAGES,
  hasDetailsErrors,
  newPackageRow,
  validateDetails,
  type JourneyState,
  type PackageRow,
} from './journeyState'
import type { Updater } from './ShippingJourney'
import { ContactShortcut, StageNav } from './StageNav'

type Props = {
  state: JourneyState
  update: Updater
  headingRef: RefObject<HTMLHeadingElement>
  onBack: () => void
  onContinue: () => void
  onContactInstead: () => void
}

const d = JOURNEY.details

export function DetailsStage({ state, update, headingRef, onBack, onContinue, onContactInstead }: Props) {
  // Errors only appear after the first "متابعة" attempt, then update live
  // as the visitor fixes them — no nagging on every keystroke before that.
  const [attempted, setAttempted] = useState(false)
  const rowTransition = useMotionTransition(DURATION.base)
  const errors = validateDetails(state)
  const shown = attempted ? errors : { packages: {} as typeof errors.packages }

  const setRow = (id: string, key: keyof Omit<PackageRow, 'id'>, value: string) =>
    update((s) => ({ ...s, packages: s.packages.map((p) => (p.id === id ? { ...p, [key]: value } : p)) }))

  const addRow = () =>
    update((s) => (s.packages.length >= MAX_PACKAGES ? s : { ...s, packages: [...s.packages, newPackageRow()] }))

  // Never remove the last remaining package by mistake.
  const removeRow = (id: string) =>
    update((s) => (s.packages.length <= 1 ? s : { ...s, packages: s.packages.filter((p) => p.id !== id) }))

  const handleContinue = () => {
    setAttempted(true)
    if (hasDetailsErrors(errors)) {
      // Focus the first invalid field once the error state has rendered.
      setTimeout(() => document.querySelector<HTMLElement>('#quote [aria-invalid="true"]')?.focus(), 0)
      return
    }
    onContinue()
  }

  return (
    <div className="flex flex-col gap-5">
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold text-gray-900 outline-none">
        {d.title}
      </h3>

      <p className="flex items-start gap-2 text-sm text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
        <Info size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
        {d.note}
      </p>

      {state.shipmentType === 'document' ? (
        <div className="max-w-xs">
          <NumberUnitField
            id="doc-weight"
            label={d.weightLabel}
            unit="كجم"
            required
            value={state.documentWeight}
            onChange={(v) => update((s) => ({ ...s, documentWeight: v }))}
            error={shown.documentWeight}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {state.packages.map((p, index) => {
              const rowErrors = shown.packages[p.id] ?? {}
              return (
                <m.div key={p.id} {...collapseMotion} transition={rowTransition} style={{ overflow: 'hidden' }}>
                  <div className="rounded-2xl border border-gray-200 p-4 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-extrabold text-gray-800">{d.packageTitle(index + 1)}</span>
                      {state.packages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(p.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                          aria-label={`${d.removePackageLabel} ${d.packageTitle(index + 1)}`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          {d.removePackageLabel}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <NumberUnitField id={`${p.id}-weight`} label={d.weightLabel} unit="كجم" required value={p.weight} onChange={(v) => setRow(p.id, 'weight', v)} error={rowErrors.weight} />
                      <NumberUnitField id={`${p.id}-length`} label={d.lengthLabel} unit="سم" required value={p.length} onChange={(v) => setRow(p.id, 'length', v)} error={rowErrors.length} />
                      <NumberUnitField id={`${p.id}-width`} label={d.widthLabel} unit="سم" required value={p.width} onChange={(v) => setRow(p.id, 'width', v)} error={rowErrors.width} />
                      <NumberUnitField id={`${p.id}-height`} label={d.heightLabel} unit="سم" required value={p.height} onChange={(v) => setRow(p.id, 'height', v)} error={rowErrors.height} />
                    </div>
                  </div>
                </m.div>
              )
            })}
          </AnimatePresence>

          {state.packages.length < MAX_PACKAGES && (
            <button
              type="button"
              onClick={addRow}
              className="h-12 rounded-2xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-500 hover:border-indigo-300 hover:text-indigo-600 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2"
            >
              <Plus size={16} aria-hidden="true" />
              {d.addPackageLabel}
            </button>
          )}
        </div>
      )}

      <StageNav onBack={onBack} onContinue={handleContinue} />
      <ContactShortcut text="لا تعرف الوزن أو الأبعاد بعد؟" onClick={onContactInstead} />
    </div>
  )
}
