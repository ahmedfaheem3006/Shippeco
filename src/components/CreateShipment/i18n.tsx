/** Provider + AR | EN switch of the «إنشاء شحنة» page language (see csLang.ts). */
import React, { useCallback, useMemo, useState } from 'react';
import { Languages } from 'lucide-react';
import { CS_LANG_STORAGE_KEY, CsLangContext, readStoredLang, useCsLang, type CsLang } from './csLang';

export function CsLangProvider({ children, initial }: { children: React.ReactNode; initial?: CsLang }) {
  const [lang, setLangState] = useState<CsLang>(() => initial ?? readStoredLang());
  const setLang = useCallback((l: CsLang) => {
    setLangState(l);
    try { window.localStorage.setItem(CS_LANG_STORAGE_KEY, l); } catch { /* private mode: this visit only */ }
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <CsLangContext.Provider value={value}>{children}</CsLangContext.Provider>;
}

/** Compact AR | EN switch beside the page title. */
export function LangToggle() {
  const { lang, setLang } = useCsLang();
  return (
    <div role="radiogroup" aria-label="Language / اللغة" className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 shadow-sm" data-testid="cs-lang-toggle">
      <Languages size={15} className="mx-1 text-slate-400" aria-hidden />
      {(['ar', 'en'] as const).map((l) => (
        <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)} lang={l}
          className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-colors min-h-[32px] ${lang === l ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
          {l === 'ar' ? 'AR' : 'EN'}
        </button>
      ))}
    </div>
  );
}
