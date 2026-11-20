/**
 * The ONE place that names the pages of the signed-in application: the title
 * in the top header (AppLayout) and the browser tab ("<title> | SHIPPEC").
 * Pages never set their own header title. Patterns are react-router paths
 * (dynamic segments supported); the first match wins — specific first.
 */
import { matchPath } from 'react-router-dom';

export const APP_TITLE_SUFFIX = 'SHIPPEC';
export const HOME_TITLE = 'الرئيسية';

export const PAGE_TITLES: ReadonlyArray<{ path: string; title: string }> = [
  { path: '/', title: HOME_TITLE },
  { path: '/dashboard', title: HOME_TITLE },
  { path: '/create-shipment', title: 'إنشاء شحنة' },
  { path: '/shipment-tracking/:awb', title: 'تفاصيل البوليصة' },
  { path: '/shipment-tracking', title: 'متابعة البوليصة' },
  { path: '/new-invoice', title: 'إنشاء فاتورة جديدة' },
  { path: '/invoices', title: 'إدارة الفواتير' },
  { path: '/invoice-template', title: 'قالب الفاتورة' },
  { path: '/reports', title: 'التقارير الشاملة' },
  { path: '/clients', title: 'إدارة العملاء' },
  { path: '/collection-model', title: 'نموذج التحصيل' },
  { path: '/expenses', title: 'المصروفات' },
  { path: '/calculator', title: 'حاسبة الشحن' },
  { path: '/reconcile', title: 'مطابقة الفواتير' },
  { path: '/profit-report', title: 'تقرير الربحية' },
  { path: '/audit-log', title: 'سجل العمليات' },
  { path: '/settings', title: 'إعدادات النظام' },
  { path: '/wa-templates', title: 'قوالب واتساب' },
  { path: '/paymob-links', title: 'روابط Paymob' },
  { path: '/tasks', title: 'المهام' },
  { path: '/support', title: 'مركز خدمة العملاء' },
  { path: '/quote-requests', title: 'طلبات الشحن والتواصل' },
];

/** The page name for a pathname ("/shipment-tracking/6606077671" → "تفاصيل البوليصة"). */
export function pageTitleFor(pathname: string): string {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  for (const p of PAGE_TITLES) {
    if (matchPath({ path: p.path, end: true }, clean)) return p.title;
  }
  return HOME_TITLE;
}

/** "متابعة البوليصة | SHIPPEC" */
export const documentTitleFor = (pathname: string) => `${pageTitleFor(pathname)} | ${APP_TITLE_SUFFIX}`;
