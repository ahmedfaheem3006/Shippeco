/**
 * Building blocks of the «إنشاء شحنة» wizard — the same Tailwind vocabulary as
 * the rest of the SHIPPEC dashboard (slate surfaces, indigo accents,
 * rounded-2xl/3xl cards, RTL, dark mode). No second design system.
 */
import React, { useId } from 'react';
import { AlertCircle, AlertTriangle, Check, Info, Loader2 } from 'lucide-react';
import { allCountries, stepLabel, stepShort, type StepDef, type StepId } from './wizardModel';
import { useCsLang } from './csLang';

export const inputCls = (error?: string | null) =>
  `w-full min-w-0 px-3 py-2.5 rounded-xl border bg-white dark:bg-slate-900/40 text-sm font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 ${
    error ? 'border-red-300 dark:border-red-800 bg-red-50/40' : 'border-slate-200 dark:border-slate-700'
  }`;

export function Field({ label, hint, error, required, children, className = '' }: {
  label: string; hint?: React.ReactNode; error?: string | null; required?: boolean; children: (id: string) => React.ReactNode; className?: string;
}) {
  const id = useId();
  return (
    <div className={`min-w-0 space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-xs font-bold text-slate-500 dark:text-slate-400">
        {label}{required && <span className="text-red-500 ms-0.5" aria-hidden="true">*</span>}
      </label>
      {children(id)}
      {error ? (
        <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 flex items-start gap-1" role="alert"><AlertCircle size={12} className="mt-0.5 shrink-0" />{error}</p>
      ) : hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { error?: string | null; onValue: (v: string) => void; ltr?: boolean };
export function TextInput({ error, onValue, ltr, className = '', ...rest }: InputProps) {
  return <input {...rest} dir={ltr ? 'ltr' : rest.dir} aria-invalid={!!error} onChange={(e) => onValue(e.target.value)} className={`${inputCls(error)} ${ltr ? 'text-start' : ''} ${className}`} />;
}

export function SelectInput({ error, onValue, children, className = '', ...rest }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & { error?: string | null; onValue: (v: string) => void }) {
  return <select {...rest} aria-invalid={!!error} onChange={(e) => onValue(e.target.value)} className={`${inputCls(error)} ${className}`}>{children}</select>;
}

export function CountrySelect({ value, onValue, error, id, disabled }: { value: string; onValue: (v: string) => void; error?: string | null; id: string; disabled?: boolean }) {
  const { lang, t } = useCsLang();
  return (
    <SelectInput id={id} value={value} onValue={onValue} error={error} disabled={disabled}>
      <option value="">{t('اختر الدولة', 'Choose a country')}</option>
      {allCountries(lang).map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
    </SelectInput>
  );
}

export function Section({ title, icon, actions, children, className = '', description }: {
  title: string; icon?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; description?: React.ReactNode;
}) {
  return (
    <section className={`bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 sm:p-6 min-w-0 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">{icon}{title}</h2>
          {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function ChoiceCards<T extends string>({ value, onChange, options, name, columns = 2, disabled }: {
  value: T; onChange: (v: T) => void; name: string; columns?: 2 | 3; disabled?: boolean;
  options: Array<{ value: T; title: string; description?: React.ReactNode; icon?: React.ReactNode; disabled?: boolean }>;
}) {
  return (
    <div role="radiogroup" aria-label={name} className={`grid grid-cols-1 ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2 sm:gap-3`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={`text-start rounded-2xl border p-3 sm:p-4 transition-colors flex gap-3 items-start min-w-0 disabled:opacity-50 disabled:cursor-not-allowed ${
              active ? 'border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'
            }`}
          >
            {o.icon && <span className={`p-2 rounded-xl shrink-0 ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>{o.icon}</span>}
            <span className="min-w-0">
              <span className="block text-sm font-extrabold text-slate-900 dark:text-white">{o.title}</span>
              {o.description && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{o.description}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Note({ tone = 'info', children, title }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: React.ReactNode; title?: string }) {
  const map = {
    info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-900/15 dark:text-sky-300',
    warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-300',
    error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-900/15 dark:text-red-300',
    success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-900/15 dark:text-green-300',
  } as const;
  const Icon = tone === 'error' ? AlertCircle : tone === 'warn' ? AlertTriangle : tone === 'success' ? Check : Info;
  return (
    <div className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-xs font-semibold leading-relaxed ${map[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} className="shrink-0 mt-0.5" />
      <div className="min-w-0">{title && <div className="font-extrabold mb-0.5">{title}</div>}{children}</div>
    </div>
  );
}

export function Button({ variant = 'primary', loading, children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  const v = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm',
    secondary: 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300',
    ghost: 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  }[variant];
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading} className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] ${v} ${className}`}>
      {loading && <Loader2 size={16} className="animate-spin" />}{children}
    </button>
  );
}

export function Stepper({ steps, current, onGo, status }: {
  steps: StepDef[]; current: StepId; onGo: (s: StepId) => void;
  status: (s: StepId) => 'done' | 'issues' | 'missing' | 'todo';
}) {
  const { lang, t } = useCsLang();
  const idx = steps.findIndex((s) => s.id === current);
  return (
    <nav aria-label={t('خطوات إنشاء الشحنة', 'Create shipment steps')} className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-3 sm:p-4">
      <div className="sm:hidden flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
        <span>{t(`الخطوة ${idx + 1} من ${steps.length}`, `Step ${idx + 1} of ${steps.length}`)}</span>
        <span className="text-indigo-700 dark:text-indigo-300">{stepLabel(steps[idx], lang)}</span>
      </div>
      <ol className="flex gap-1 sm:gap-2 overflow-x-auto hidden-scrollbar">
        {steps.map((s, i) => {
          const st = status(s.id);
          const active = s.id === current;
          return (
            <li key={s.id} className="flex-1 min-w-[38px] sm:min-w-[92px]">
              <button
                type="button"
                onClick={() => onGo(s.id)}
                aria-current={active ? 'step' : undefined}
                aria-label={`${i + 1}. ${stepLabel(s, lang)}${st === 'issues' ? t(' — توجد أخطاء', ' — has errors') : st === 'missing' ? t(' — بيانات ناقصة', ' — missing data') : st === 'done' ? t(' — مكتملة', ' — complete') : ''}`}
                className="w-full flex flex-col items-center gap-1.5 group"
              >
                <span className={`h-1.5 w-full rounded-full ${active ? 'bg-indigo-600' : st === 'issues' ? 'bg-red-400' : st === 'done' ? 'bg-indigo-300 dark:bg-indigo-700' : 'bg-slate-200 dark:bg-slate-700'}`} />
                <span className={`flex items-center gap-1 text-[11px] font-bold ${active ? 'text-indigo-700 dark:text-indigo-300' : st === 'issues' ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'} group-hover:text-indigo-600`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] tabular-nums ${active ? 'bg-indigo-600 text-white' : st === 'done' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : st === 'issues' ? 'bg-red-100 text-red-700' : 'bg-slate-100 dark:bg-slate-700'}`}>
                    {st === 'done' && !active ? <Check size={11} /> : st === 'issues' ? '!' : i + 1}
                  </span>
                  <span className="hidden sm:inline whitespace-nowrap">{stepShort(s, lang)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-700/60 ${className}`} aria-hidden="true" />;
}

export const Stat = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'bad' }) => (
  <div className="min-w-0">
    <div className="text-[11px] font-bold text-slate-400">{label}</div>
    <div className={`text-sm font-extrabold tabular-nums break-words ${tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-700 dark:text-green-400' : 'text-slate-900 dark:text-white'}`}>{value}</div>
  </div>
);
