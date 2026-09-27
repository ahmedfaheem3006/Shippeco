import ctaFallback from '../../assets/image 3.png'
import ctaMobile from '../../assets/landing/van-warehouse-mobile.webp'
import ctaDesktop from '../../assets/landing/van-warehouse-desktop.webp'
import shippecLogo from '../../assets/shippec.jpeg'
import { Mail, Phone, MessageCircle } from 'lucide-react'
import { FINAL_CTA, FOOTER, CONTACT, COMPANY, SOCIAL_LINKS } from '../../content/landingPageContent'

export function LandingFinalCtaFooter() {
  const year = new Date().getFullYear()

  return (
    <>
      <section className="relative">
        <div className="absolute inset-0">
          <picture>
            <source media="(min-width: 768px)" srcSet={ctaDesktop} type="image/webp" />
            <source srcSet={ctaMobile} type="image/webp" />
            <img
              src={ctaFallback}
              alt="صورة توضيحية لعربية توصيل أمام مستودع شحن"
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </picture>
          <div className="absolute inset-0 bg-slate-900/70" />
        </div>
        <div className="relative max-w-4xl mx-auto px-5 py-20 md:py-28 text-center shp-reveal">
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white">{FINAL_CTA.title}</h2>
          <a
            href="#quote"
            className="mt-8 inline-flex items-center justify-center px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold shadow-lg shadow-indigo-900/30 transition-all"
          >
            {FINAL_CTA.buttonLabel}
          </a>
        </div>
      </section>

      <footer className="bg-slate-950 text-slate-300">
        <div className="max-w-6xl mx-auto px-5 py-12 grid grid-cols-1 md:grid-cols-3 gap-10">
          <div>
            <img src={shippecLogo} alt={`${COMPANY.nameAr} ${COMPANY.nameEn}`} className="h-8 w-auto max-w-[110px] object-contain bg-white rounded-lg p-1" />
            <p className="mt-4 text-sm text-slate-400 leading-relaxed max-w-sm">{FOOTER.blurb}</p>
            <p className="mt-3 text-xs text-slate-500">السجل التجاري: <span dir="ltr">{COMPANY.commercialRegister}</span></p>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <span className="font-bold text-slate-200">تواصل معنا</span>
            <a href={`tel:${CONTACT.phone}`} className="inline-flex items-center gap-2 text-slate-300 hover:text-white">
              <Phone size={16} aria-hidden="true" />
              <span dir="ltr">{CONTACT.phoneDisplay}</span>
            </a>
            <a
              href={CONTACT.whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-slate-300 hover:text-white"
            >
              <MessageCircle size={16} aria-hidden="true" />
              واتساب
            </a>
            <a href={`mailto:${CONTACT.email}`} className="inline-flex items-center gap-2 text-slate-300 hover:text-white">
              <Mail size={16} aria-hidden="true" />
              <span dir="ltr">{CONTACT.email}</span>
              <span className="text-xs text-slate-500">(الاستفسارات والشكاوى)</span>
            </a>
            <a href={`mailto:${CONTACT.supportEmail}`} className="inline-flex items-center gap-2 text-slate-300 hover:text-white">
              <Mail size={16} aria-hidden="true" />
              <span dir="ltr">{CONTACT.supportEmail}</span>
              <span className="text-xs text-slate-500">(خدمة العملاء)</span>
            </a>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <nav className="flex flex-col gap-2">
              {FOOTER.links.map((link) => (
                <a key={link.href} href={link.href} className="text-slate-400 hover:text-white transition-colors">
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="flex flex-wrap gap-2 mt-2">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800">
          <div className="max-w-6xl mx-auto px-5 py-5 text-center text-xs text-slate-500">
            © {year} {COMPANY.nameAr} {COMPANY.nameEn}
          </div>
        </div>
      </footer>
    </>
  )
}
