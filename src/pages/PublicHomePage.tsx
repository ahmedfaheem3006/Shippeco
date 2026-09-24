// Public marketing homepage — served at "/".
//
// Kept deliberately dependency-light (no react-router hooks, no zustand, no
// icon library, no API calls): it is rendered both by the live SPA and by
// the build-time prerender step (scripts/prerender.mjs, via react-dom/server),
// and the simpler its dependency graph, the more reliably it SSRs. Plain
// <a> tags are used for navigation on purpose — they need no Router context
// and are the most crawlable link form anyway.
//
// Content is limited to what's actually true of the product today (see
// src/database/seeds/002_default_settings.ts and services/routes in the
// Backend) — no invented pricing, branches, phone numbers, partnerships or
// delivery-time claims.
import shippecLogo from '../assets/shippec.jpeg'

const CONTACT_EMAIL = 'info@shippec.com'

const SERVICES: { title: string; description: string }[] = [
  {
    title: 'إدارة الفواتير والمدفوعات',
    description: 'إصدار الفواتير ومتابعة حالتها (مدفوعة / جزئية / غير مدفوعة) في مكان واحد.',
  },
  {
    title: 'حاسبة تكلفة شحن DHL',
    description: 'احتساب تكلفة الشحن الدولي عبر DHL بناءً على الوزن ونوع الخدمة.',
  },
  {
    title: 'مطابقة فواتير الشحن',
    description: 'مطابقة فواتير DHL مع سجلات المنصة لاكتشاف أي فروقات في التكلفة.',
  },
  {
    title: 'روابط دفع إلكتروني آمنة',
    description: 'إنشاء روابط دفع لعملائك عبر بوابة Paymob وتحصيل المستحقات أونلاين.',
  },
  {
    title: 'متابعة التحصيل والمستحقات',
    description: 'تتبّع المبالغ المستحقة من العملاء وحالة كل عملية تحصيل.',
  },
  {
    title: 'تقارير الربحية',
    description: 'تقارير تلخّص الإيرادات والتكاليف والربحية على مستوى الفواتير.',
  },
]

export function PublicHomePage() {
  const year = new Date().getFullYear()

  return (
    <div dir="rtl" className="min-h-screen bg-white text-gray-900 font-cairo" lang="ar">
      {/* JSON-LD structured data — real, verifiable facts only */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Shippec',
            alternateName: 'شيب بيك',
            url: 'https://shippeco.com',
            logo: 'https://shippeco.com/apple-touch-icon.png',
            email: CONTACT_EMAIL,
            areaServed: ['EG', 'SA'],
            sameAs: [],
          }),
        }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'شيب بيك',
            url: 'https://shippeco.com',
            inLanguage: 'ar',
          }),
        }}
      />

      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={shippecLogo}
              alt="شيب بيك Shippec"
              className="h-9 w-auto max-w-[130px] object-contain"
              width={130}
              height={36}
            />
          </div>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors"
          >
            تسجيل الدخول
          </a>
        </div>
      </header>

      <main>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-5 pt-14 pb-16 text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight text-gray-900">
          منصة شيب بيك لإدارة الشحن والفواتير
        </h1>
        <p className="mt-5 max-w-2xl mx-auto text-base sm:text-lg text-gray-600 leading-relaxed">
          منصة واحدة تجمع إصدار الفواتير، وحساب تكلفة الشحن الدولي عبر DHL، ومتابعة التحصيل
          والمطابقة المالية، لخدمة أنشطة الشحن العاملة بين <strong>مصر</strong> و<strong>السعودية</strong>.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/login"
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/20 transition-colors"
          >
            تسجيل الدخول إلى حسابك
          </a>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('طلب عرض سعر - شيب بيك')}`}
            className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-xl border border-gray-200 hover:border-indigo-300 text-gray-900 font-bold transition-colors"
          >
            اطلب عرض سعر
          </a>
        </div>
      </section>

      {/* Services */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-5 py-14">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-gray-900">خدماتنا</h2>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SERVICES.map((s) => (
              <article
                key={s.title}
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm"
              >
                <h3 className="font-bold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{s.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="max-w-6xl mx-auto px-5 py-14 text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">تواصل معنا</h2>
        <p className="mt-4 text-gray-600">
          لطلب عرض سعر أو الاستفسار عن خدماتنا، راسلنا على{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 font-bold hover:underline" dir="ltr">
            {CONTACT_EMAIL}
          </a>
        </p>
        <p className="mt-2 text-sm text-gray-400">
          عميل حالي؟ <a href="/login" className="text-indigo-600 hover:underline">سجّل الدخول من هنا</a>
        </p>
      </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-5 py-6 text-center text-xs text-gray-500">
          © {year} شيب بيك Shippec
        </div>
      </footer>
    </div>
  )
}

export default PublicHomePage
