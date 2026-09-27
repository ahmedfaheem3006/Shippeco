import { ABOUT } from '../../content/landingPageContent'

export function LandingAbout() {
  return (
    <section id="about" className="max-w-4xl mx-auto px-5 py-14 md:py-16 text-center">
      <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 shp-animate-in">{ABOUT.title}</h2>
      <p className="mt-4 text-base text-gray-600 leading-relaxed shp-animate-in" style={{ animationDelay: '0.06s' }}>
        {ABOUT.paragraph}
      </p>
    </section>
  )
}
