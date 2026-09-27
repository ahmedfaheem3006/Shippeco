// All copy, service descriptions, FAQ answers and contact details for the
// public homepage in one place — edit this file to change what the
// landing page says without touching component code.
//
// Every claim here reflects something actually true of the product today
// (see the SEO task's homepage copy and this codebase's DHL-cost-calculation
// / Paymob / invoicing features) — nothing about specific delivery times,
// branches, air/sea freight, customs clearance, or partnerships is stated,
// because none of that is confirmed anywhere in this project.

export const CONTACT = {
  email: 'info@shippec.com',
  /** Configurable, optional. Leave BACKUP_/VITE_PUBLIC_WHATSAPP_NUMBER unset
   *  to hide every WhatsApp button/link on the page (no number is invented
   *  here) — set it (international format, digits only, e.g. "9665xxxxxxxx")
   *  once a confirmed business WhatsApp number exists. See .env.example. */
  whatsappNumber: ((import.meta as any).env?.VITE_PUBLIC_WHATSAPP_NUMBER as string | undefined)?.replace(/\D/g, '') || '',
}

export function whatsappLink(message: string): string {
  const encoded = encodeURIComponent(message)
  return `https://wa.me/${CONTACT.whatsappNumber}?text=${encoded}`
}

export const NAV_LINKS = [
  { href: '#services', label: 'خدماتنا' },
  { href: '#how-it-works', label: 'كيف تبدأ؟' },
  { href: '#about', label: 'عن شيب بيك' },
  { href: '#faq', label: 'الأسئلة الشائعة' },
]

export const HERO = {
  // Not presented as a confirmed "international shipping between Egypt and
  // Saudi Arabia" service — that's only a targeted audience, not a
  // confirmed scope — so this stays generic.
  eyebrow: 'شيب بيك لخدمات الشحن',
  titleLine1: 'شحنتك القادمة',
  titleLine2: 'تبدأ من هنا.',
  description:
    'أرسل تفاصيل شحنتك ووجهتها، ودع فريق شيب بيك يساعدك في معرفة الخيارات المتاحة وطلب عرض سعر.',
  primaryCta: { label: 'اطلب عرض سعر', href: '#quote' },
  secondaryCta: { label: 'كيف تبدأ؟', href: '#how-it-works' },
  whatsappCtaLabel: 'تواصل عبر واتساب',
  // Only true because the quote-request flow never creates an account —
  // see quoteRequestService.ts / the Backend's public POST /quote-requests.
  noAccountNote: 'يمكنك إرسال الطلب دون إنشاء حساب',
}

export type ServiceItem = { icon: 'globe' | 'calculator' | 'file-check'; title: string; description: string }

export const SERVICES: ServiceItem[] = [
  {
    icon: 'globe',
    title: 'شحن الطرود الدولي',
    description: 'أرسل تفاصيل شحنتك ونرتب نقلها من نقطة الإرسال إلى وجهتها.',
  },
  {
    icon: 'calculator',
    title: 'عرض سعر واضح لكل طلب',
    description: 'نحسب تكلفة الشحن بناءً على الوزن والوجهة قبل تأكيد أي طلب.',
  },
  {
    icon: 'file-check',
    title: 'فاتورة ودفع إلكتروني آمن',
    description: 'فاتورة واضحة لكل شحنة، مع خيار الدفع الإلكتروني الآمن عند الحاجة.',
  },
]

export const ABOUT = {
  title: 'عن شيب بيك',
  paragraph:
    'شيب بيك منصة متخصصة في تنظيم شحن الطرود الدولي وإدارة فواتيرها لعملاء في مصر والسعودية — من استلام تفاصيل الشحنة، إلى تجهيز عرض السعر والفاتورة، حتى تحصيل المستحقات إلكترونيًا.',
}

export const HOW_IT_WORKS = [
  {
    step: 1,
    title: 'أرسل تفاصيل شحنتك',
    description: 'املأ نموذج طلب عرض السعر ببيانات الإرسال والاستلام ومحتويات الطرد.',
  },
  {
    step: 2,
    title: 'راجع عرض السعر والتفاصيل مع الفريق',
    description: 'يتواصل معك فريق شيب بيك لمراجعة الطلب والاتفاق على التفاصيل النهائية.',
  },
  {
    step: 3,
    title: 'أكّد الطلب لترتيب الخطوات التالية',
    description: 'بعد التأكيد، تبدأ إجراءات تجهيز الشحنة وإصدار الفاتورة.',
  },
]

export const SHIPMENT_DETAILS_SECTION = {
  title: 'حدّد محتويات شحنتك بدقة',
  description:
    'ذكر المحتويات والوزن التقريبي والأبعاد يساعدنا على تقييم طلبك وإعداد عرض سعر دقيق من أول مرة، ويقلل الحاجة لتعديلات لاحقة.',
}

export const CUSTOMER_EXPERIENCE_SECTION = {
  title: 'فريقنا معك خطوة بخطوة',
  description:
    'بعد إرسال الطلب، يتواصل معك فريق شيب بيك لمراجعة تفاصيل الشحنة والرد على استفساراتك قبل تأكيد الطلب نهائيًا.',
}

export const FINAL_CTA = {
  title: 'جاهز لترتيب شحنتك؟',
  buttonLabel: 'اطلب عرض سعر',
}

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'كيف أطلب عرض سعر؟',
    a: 'املأ نموذج "اطلب عرض سعر" ببيانات شحنتك، وسيتواصل معك فريقنا بخصوص السعر والتفاصيل.',
  },
  {
    q: 'ما البيانات المطلوبة عن الشحنة؟',
    a: 'دولة ومدينة الإرسال والاستلام، ومحتويات الطرد، ويفضّل ذكر الوزن التقريبي وأي تفاصيل إضافية مثل عدد الطرود أو الأبعاد.',
  },
  {
    q: 'كيف تؤثر الأبعاد والوزن والوجهة على التسعير؟',
    a: 'تكلفة الشحن الدولي تُحسب بناءً على وزن ومقاسات الطرد والمسافة بين نقطتي الإرسال والاستلام، لذلك كل هذه التفاصيل تدخل في عرض السعر النهائي.',
  },
  {
    q: 'كيف أعرف مدة الشحن المتوقعة؟',
    a: 'تختلف المدة حسب الوجهة وطبيعة الشحنة — سيوضح لك فريقنا المدة المتوقعة عند مراجعة طلبك.',
  },
  {
    q: 'كيف أتأكد من إمكانية شحن محتويات الطرد؟',
    a: 'اذكر محتويات الطرد بوضوح في النموذج، وسيراجعها فريقنا معك للتأكد من إمكانية شحنها قبل تأكيد الطلب.',
  },
  {
    q: 'كيف أتواصل بشأن طلبي؟',
    a: `يمكنك التواصل عبر البريد الإلكتروني ${CONTACT.email}` + (CONTACT.whatsappNumber ? ' أو واتساب.' : '.'),
  },
]

export const FOOTER = {
  blurb: 'منصة شيب بيك لإدارة شحن الطرود الدولي وفواتيرها بين مصر والسعودية.',
  links: [
    { label: 'خدماتنا', href: '#services' },
    { label: 'كيف تبدأ؟', href: '#how-it-works' },
    { label: 'الأسئلة الشائعة', href: '#faq' },
    { label: 'تسجيل الدخول', href: '/login' },
  ],
}

export const QUOTE_FORM = {
  title: 'أخبرنا عن شحنتك',
  description: 'أدخل التفاصيل المتاحة، وسيتواصل معك الفريق لمراجعة طلبك.',
  steps: ['ترسل بيانات الشحنة.', 'يراجع الفريق التفاصيل.', 'تتواصلون بشأن عرض السعر.'],
  additionalDetailsLabel: 'إضافة تفاصيل أخرى — اختياري',
  submitLabel: 'إرسال طلب عرض السعر',
  privacyNote: 'سنستخدم بياناتك للتواصل بشأن طلب الشحن.',
  successMessage: 'تم إرسال طلبك بنجاح — سيتواصل معك فريقنا قريبًا.',
  genericErrorMessage: 'تعذر إرسال الطلب، الرجاء المحاولة مرة أخرى.',
  fieldErrorsMessage: 'تحقق من الحقول المُشار إليها بالأسفل.',
}

/** Country options for the shipment origin/destination selects — Egypt and
 *  Saudi Arabia are surfaced first (the confirmed corridor) without
 *  limiting the form to only those two, per the brief. */
export const COUNTRY_OPTIONS = [
  { value: 'EG', label: 'مصر' },
  { value: 'SA', label: 'السعودية' },
  { value: 'AE', label: 'الإمارات' },
  { value: 'KW', label: 'الكويت' },
  { value: 'QA', label: 'قطر' },
  { value: 'BH', label: 'البحرين' },
  { value: 'OM', label: 'عُمان' },
  { value: 'JO', label: 'الأردن' },
  { value: 'OTHER', label: 'دولة أخرى' },
]

/** Dial codes for the phone input — Egypt/Saudi first, matches
 *  COUNTRY_OPTIONS ordering. */
export const PHONE_COUNTRY_CODES = [
  { value: '+20', label: 'مصر (+20)' },
  { value: '+966', label: 'السعودية (+966)' },
  { value: '+971', label: 'الإمارات (+971)' },
  { value: '+965', label: 'الكويت (+965)' },
  { value: '+974', label: 'قطر (+974)' },
  { value: '+973', label: 'البحرين (+973)' },
  { value: '+968', label: 'عُمان (+968)' },
  { value: '+962', label: 'الأردن (+962)' },
]
