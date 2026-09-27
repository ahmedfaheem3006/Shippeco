// All copy, service descriptions, FAQ answers and contact details for the
// public homepage in one place — edit this file to change what the
// landing page says without touching component code.
//
// Contact details/social links are the company's real, confirmed data.
// Nothing about branch locations, delivery times, "cheapest" claims, live
// pricing, or partner carriers is stated unless it's actually true of the
// product today — see each section's own comment for the specific reason.

export const COMPANY = {
  nameAr: 'شيب بيك للخدمات اللوجستية',
  nameEn: 'SHIPPEC',
  // The public domain this project is meant to eventually serve from.
  // NOT switched over yet (DNS/hosting cutover is a separate, external
  // step — see docs/DOMAIN-MIGRATION.md) — every URL actually emitted by
  // this build (canonical, OG, sitemap, prerender) still uses the current
  // live domain until that migration actually happens.
  targetDomain: 'https://shippec.com',
  commercialRegister: '2053123860',
  addressAr: '7610، طريق الأمير نايف بن عبدالعزيز، حي الروضة، الدمام 32256، المملكة العربية السعودية',
}

export const CONTACT = {
  email: 'info@shippec.com',
  supportEmail: 'cs@shippec.com',
  // E.164, used for the tel: link and shown LTR.
  phone: '+966537366522',
  phoneDisplay: '+966 53 736 6522',
  // A real WhatsApp Business shortlink to a saved message template — not a
  // generic wa.me/<number>?text= link, so it's used exactly as given
  // rather than re-encoded with our own message text.
  whatsappLink: 'https://wa.me/message/FY3GJNSM4BCGO1',
}

export const SOCIAL_LINKS = [
  { label: 'Instagram', href: 'https://www.instagram.com/shippec.sa/' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@shippec.sa' },
  { label: 'X', href: 'https://twitter.com/shippec_sa' },
  { label: 'Snapchat', href: 'https://t.snapchat.com/YnLZttBF' },
]

export const NAV_LINKS = [
  { href: '#services', label: 'خدماتنا' },
  { href: '#about', label: 'عن شيب بيك' },
  { href: '#visit', label: 'زورونا' },
  { href: '#faq', label: 'الأسئلة الشائعة' },
]

export const HERO = {
  eyebrow: 'شيب بيك لخدمات الشحن',
  title: 'نخدمك وين ما كنت',
  description:
    'حلول للشحن المحلي والدولي، والتغليف والتخزين والتوزيع للأفراد والشركات. أخبرنا عن شحنتك، وساعدنا نختار معك الخدمة المناسبة.',
  primaryCta: { label: 'ابدأ شحنتك', href: '#quote' },
  // Links to the real WhatsApp business link (CONTACT.whatsappLink), not
  // an in-page anchor — this is the "وسيلة التواصل الحقيقية" the brief
  // asks the secondary button to open.
  secondaryCtaLabel: 'تواصل معنا',
  noAccountNote: 'يمكنك إرسال الطلب دون إنشاء حساب',
}

export type ServiceItem = {
  icon: 'globe' | 'truck' | 'route' | 'file-check' | 'warehouse' | 'package-check' | 'droplet' | 'building' | 'shopping-bag'
  title: string
  description: string
  /** Which path of the shipping journey actually fits this service —
   *  shown when a visitor expands "تفاصيل الخدمة" on the card, so the
   *  label describes something the card genuinely does. */
  bestPath: 'waybill' | 'contact'
}

export const SERVICES: ServiceItem[] = [
  {
    icon: 'globe',
    title: 'الشحن الدولي',
    description: 'حلول لإرسال واستقبال الطرود والبضائع بين الدول، مع اختيار الخدمة المناسبة للوجهة وطبيعة الشحنة.',
    bestPath: 'waybill',
  },
  {
    icon: 'truck',
    title: 'الشحن المحلي',
    description: 'توصيل الطرود والمنتجات داخل الدولة لتلبية احتياجات الأفراد والمتاجر والشركات.',
    bestPath: 'waybill',
  },
  {
    icon: 'route',
    title: 'خدمات التوزيع',
    description: 'تنسيق نقل وتوزيع المنتجات من الموردين إلى العملاء لدعم أعمالك اليومية.',
    bestPath: 'contact',
  },
  {
    icon: 'file-check',
    title: 'التخليص الجمركي',
    description: 'المساعدة في استكمال مستندات وإجراءات التخليص الجمركي لشحنات الاستيراد والتصدير.',
    bestPath: 'contact',
  },
  {
    icon: 'warehouse',
    title: 'خدمات التخزين',
    description: 'حلول لاستلام البضائع وتخزينها وتنظيمها وفرزها وفق احتياجات النشاط.',
    bestPath: 'contact',
  },
  {
    icon: 'package-check',
    title: 'حلول التغليف',
    description: 'خيارات تغليف تناسب طبيعة المنتجات، باستخدام الصناديق ومواد الحماية المناسبة للشحن.',
    bestPath: 'contact',
  },
  {
    icon: 'droplet',
    title: 'شحن السوائل والمواد ذات المتطلبات الخاصة',
    description: 'ترتيبات متخصصة لشحن العطور والسوائل والمواد الخطرة المقبولة، وفق متطلبات الناقل والوجهة.',
    bestPath: 'contact',
  },
  {
    icon: 'building',
    title: 'حلول للأفراد والشركات',
    description: 'حلول لوجستية مخصصة تجمع خدمات الشحن والتغليف والتخزين والتوزيع حسب احتياجك.',
    bestPath: 'contact',
  },
  {
    icon: 'shopping-bag',
    title: 'المتسوق الشخصي',
    description: 'المساعدة في الشراء وتجهيز الشحن من الولايات المتحدة الأمريكية وتركيا وألمانيا.',
    bestPath: 'contact',
  },
]

export const FEATURES = [
  {
    title: 'خدمات تناسب شحنتك',
    description: 'خيارات متعددة بحسب نوع الشحنة والوجهة.',
  },
  {
    title: 'حلول تدعم أعمالك',
    description: 'من التغليف والتخزين إلى الشحن والتوزيع.',
  },
  {
    title: 'تواصل مباشر مع فريقنا',
    description: 'عبر الهاتف وواتساب والبريد الإلكتروني.',
  },
]

export const ABOUT = {
  title: 'عن شيب بيك',
  paragraph:
    'شيب بيك للخدمات اللوجستية منصة تجمع حلول الشحن المحلي والدولي مع التغليف والتخزين والتوزيع، لخدمة الأفراد والشركات — من استلام تفاصيل الشحنة إلى متابعتها مع فريق مختص.',
}

export const HOW_IT_WORKS = [
  {
    step: 1,
    title: 'حدّد مسار شحنتك',
    description: 'اختر دولة الاستلام والتسليم، ونوع الشحنة (مستندات أو طرد).',
  },
  {
    step: 2,
    title: 'أدخل تفاصيل الشحنة',
    description: 'الوزن والأبعاد بعد التغليف، مع إمكانية إضافة أكثر من طرد.',
  },
  {
    step: 3,
    title: 'اختر طريقة المتابعة',
    description: 'استكمال بيانات البوليصة مباشرة، أو ترك بياناتك ليتواصل معك فريقنا.',
  },
]

export const SHIPMENT_DETAILS_SECTION = {
  title: 'حدّد محتويات شحنتك بدقة',
  description:
    'ذكر المحتويات والوزن والأبعاد بعد التغليف يساعد فريقنا على مراجعة طلبك بدقة من أول مرة، ويقلل الحاجة لتعديلات لاحقة.',
}

export const CUSTOMER_EXPERIENCE_SECTION = {
  title: 'فريقنا معك خطوة بخطوة',
  description:
    'بعد إرسال طلبك، يتواصل معك فريق شيب بيك لمراجعة تفاصيل الشحنة والرد على استفساراتك ومتابعة الخطوات التالية.',
}

export const FINAL_CTA = {
  title: 'جاهز تبدأ شحنتك؟',
  buttonLabel: 'ابدأ شحنتك',
}

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'كيف أبدأ شحنة جديدة؟',
    a: 'اضغط "ابدأ شحنتك"، وحدد دولتي الاستلام والتسليم ونوع الشحنة، ثم اختر إما استكمال بيانات البوليصة مباشرة أو ترك بياناتك ليتواصل معك فريقنا.',
  },
  {
    q: 'ما الفرق بين "استكمال بيانات البوليصة" و"تواصلوا معي"؟',
    a: 'الأول يجمع بيانات المرسل والمستلم الكاملة لإرسال طلب إصدار بوليصة لمراجعة فريقنا. والثاني أبسط: اسمك ورقم جوالك فقط، إذا كنت تفضّل أن يتواصل معك فريقنا أولًا أو لا تعرف كل تفاصيل شحنتك بعد.',
  },
  {
    q: 'هل يصدر طلب إصدار البوليصة تلقائيًا؟',
    a: 'لا — يصل طلبك لفريقنا بحالة "بانتظار المراجعة"، ويتواصل معك الفريق لتأكيد التفاصيل والخطوات التالية.',
  },
  {
    q: 'ما البيانات المطلوبة عن الشحنة؟',
    a: 'دولتا الاستلام والتسليم، نوع الشحنة (مستندات أو طرد)، والوزن والأبعاد بعد التغليف — ويفضَّل ذكر أي تفاصيل إضافية تساعد فريقنا في المراجعة.',
  },
  {
    q: 'كيف تُشحن العطور والسوائل والمواد ذات المتطلبات الخاصة؟',
    a: 'هذه الشحنات تحتاج ترتيبات خاصة وفق متطلبات الناقل والوجهة — اذكر تفاصيلها في طلبك وسيراجعها فريقنا معك قبل التأكيد.',
  },
  {
    q: 'كيف أتواصل بشأن طلبي؟',
    a: `يمكنك التواصل عبر الهاتف ${CONTACT.phoneDisplay}، أو واتساب، أو البريد الإلكتروني ${CONTACT.email} (وللاستفسارات بعد الشحن: ${CONTACT.supportEmail}).`,
  },
]

export const FOOTER = {
  blurb: 'شيب بيك للخدمات اللوجستية — حلول الشحن المحلي والدولي، والتغليف والتخزين والتوزيع للأفراد والشركات.',
  links: [
    { label: 'خدماتنا', href: '#services' },
    { label: 'عن شيب بيك', href: '#about' },
    { label: 'الأسئلة الشائعة', href: '#faq' },
    { label: 'تسجيل الدخول', href: '/login' },
  ],
}

export const VISIT_SECTION = {
  title: 'زورونا في الدمام',
  // Working hours from the previous site couldn't be confirmed as
  // currently accurate (they read "Sat–Thu, 9 AM to 1 AM"), so they're
  // left unpublished rather than guessed or silently "corrected".
  hoursNote: 'مواعيد العمل قيد التأكيد — تواصل معنا للاستفسار عنها مباشرة.',
}

export const QUOTE_FORM = {
  privacyNote: 'سنستخدم بياناتك للتواصل بشأن طلب الشحن.',
  genericErrorMessage: 'تعذر إرسال الطلب، الرجاء المحاولة مرة أخرى.',
  fieldErrorsMessage: 'تحقق من الحقول المُشار إليها بالأسفل.',
}

/** Copy for the multi-step shipping journey (route -> type -> details ->
 *  path choice -> contact/waybill form). */
export const JOURNEY = {
  stepLabels: ['المسار', 'نوع الشحنة', 'التفاصيل', 'المتابعة'],
  continueLabel: 'متابعة',
  backLabel: 'السابق',
  route: {
    title: 'من وإلى أين تشحن؟',
    pickupLabel: 'الاستلام من',
    deliveryLabel: 'التسليم إلى',
  },
  type: {
    title: 'ما نوع شحنتك؟',
    document: { title: 'مستندات', description: 'مستندات وأوراق' },
    package: { title: 'طرد', description: 'منتجات أو أغراض داخل طرد' },
  },
  details: {
    title: 'وزن وأبعاد الشحنة',
    note: 'أدخل الوزن والأبعاد بعد التغليف لمساعدتنا في مراجعة تفاصيل الشحنة بدقة.',
    weightLabel: 'الوزن (كجم)',
    lengthLabel: 'الطول (سم)',
    widthLabel: 'العرض (سم)',
    heightLabel: 'الارتفاع (سم)',
    addPackageLabel: 'إضافة طرد آخر',
    packageTitle: (n: number) => `الطرد ${n}`,
    removePackageLabel: 'حذف',
  },
  path: {
    title: 'كيف تفضّل المتابعة؟',
    waybill: {
      title: 'استكمال بيانات البوليصة',
      description: 'أدخل بيانات المرسل والمستلم لاستكمال طلب الشحن.',
    },
    contact: {
      title: 'تواصلوا معي',
      description: 'اترك اسمك ورقم جوالك، وسيتواصل معك فريقنا بشأن شحنتك.',
    },
  },
  contactForm: {
    title: 'تواصلوا معي',
    description: 'اترك اسمك ورقم جوالك وسيتواصل معك فريقنا بشأن شحنتك — بدون التزام بإكمال بقية البيانات الآن.',
    nameLabel: 'الاسم',
    phoneLabel: 'رقم الجوال',
    submitLabel: 'إرسال طلب التواصل',
    successMessage: 'تم استلام طلبك، وسيتواصل معك فريق شيب بيك بشأن شحنتك.',
  },
  waybillForm: {
    title: 'استكمال بيانات البوليصة',
    senderTitle: 'بيانات المرسل',
    receiverTitle: 'بيانات المستلم',
    nameLabel: 'الاسم',
    phoneLabel: 'رقم الجوال',
    addressLabel: 'العنوان',
    cityLabel: 'المدينة',
    postalCodeLabel: 'الرمز البريدي (اختياري)',
    contentsLabel: 'محتويات الشحنة',
    declaredValueLabel: 'القيمة التقريبية (اختياري)',
    declaredCurrencyLabel: 'العملة',
    customsInfoLabel: 'معلومات جمركية إضافية (اختياري)',
    reviewTitle: 'راجع بيانات طلبك',
    submitLabel: 'إرسال طلب إصدار البوليصة',
    pendingReviewNote: 'لا تُصدر البوليصة تلقائيًا — سيصل طلبك لفريقنا بحالة "بانتظار المراجعة"، وسنتواصل معك لتأكيد التفاصيل.',
    successMessage: 'تم استلام طلب إصدار البوليصة، وحالته الآن بانتظار مراجعة الفريق. سنتواصل معك قريبًا.',
  },
}

// The country list (names in Arabic/English + dial codes) lives in
// src/utils/phone.ts (COUNTRIES) — shared by the route pickers and every
// phone field, so it's defined exactly once.
