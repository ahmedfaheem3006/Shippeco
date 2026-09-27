import { ABOUT } from '../../content/landingPageContent'

export function LandingAbout() {
  return (
    <section id="about" className="scroll-mt-20 max-w-4xl mx-auto px-5 py-14 md:py-16 text-center">
      <div className="shp-reveal">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">{ABOUT.title}</h2>
        <p className="mt-4 text-base text-gray-600 leading-relaxed">{ABOUT.paragraph}</p>
      </div>
    </section>
  )
}
