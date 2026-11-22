/**
 * «إنشاء شحنة» language (AR | EN) — scoped to the Create Shipment page ONLY
 * (every step of its wizard). The rest of SHIPPEC, the sidebar and the global
 * app language never change. The choice is a per-viewer convenience kept in
 * localStorage; switching never touches the form data.
 */
import { createContext, useCallback, useContext } from 'react';

export type CsLang = 'ar' | 'en';
export const CS_LANG_STORAGE_KEY = 'shippec.createShipment.lang';

/** Pick the text of the current language: tr(lang, 'عربي', 'English'). */
export const tr = (lang: CsLang, ar: string, en: string) => (lang === 'en' ? en : ar);

export function readStoredLang(): CsLang {
  try {
    return window.localStorage.getItem(CS_LANG_STORAGE_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

export const CsLangContext = createContext<{ lang: CsLang; setLang: (l: CsLang) => void }>({ lang: 'ar', setLang: () => undefined });

export function useCsLang() {
  const { lang, setLang } = useContext(CsLangContext);
  const t = useCallback((ar: string, en: string) => tr(lang, ar, en), [lang]);
  return { lang, setLang, t, dir: (lang === 'en' ? 'ltr' : 'rtl') as 'ltr' | 'rtl' };
}
