import packingFallback from '../../assets/image 2.png'
import packingMobile from '../../assets/landing/packing-preparation-mobile.webp'
import packingDesktop from '../../assets/landing/packing-preparation-desktop.webp'
import deliveryFallback from '../../assets/image 1.png'
import deliveryMobile from '../../assets/landing/customer-delivery-mobile.webp'
import deliveryDesktop from '../../assets/landing/customer-delivery-desktop.webp'
import { SHIPMENT_DETAILS_SECTION, CUSTOMER_EXPERIENCE_SECTION } from '../../content/landingPageContent'

function AlternatingRow({
  title,
  description,
  imageFallback,
  imageMobile,
  imageDesktop,
  imageAlt,
  imageOnRight,
}: {
  title: string
  description: string
  imageFallback: string
  imageMobile: string
  imageDesktop: string
  imageAlt: string
  imageOnRight: boolean
}) {
  const imageBlock = (
    <div className="flex-1 w-full shp-reveal">
      <picture>
        <source media="(min-width: 768px)" srcSet={imageDesktop} type="image/webp" />
        <source srcSet={imageMobile} type="image/webp" />
        <img
          src={imageFallback}
          alt={imageAlt}
          loading="lazy"
          className="w-full h-auto rounded-2xl shadow-md object-contain bg-gray-50"
          width={1672}
          height={941}
        />
      </picture>
    </div>
  )
  const textBlock = (
    <div className="flex-1 text-center md:text-right shp-reveal" style={{ transitionDelay: '0.08s' }}>
      <h3 className="text-xl sm:text-2xl font-extrabold text-gray-900">{title}</h3>
      <p className="mt-3 text-gray-600 leading-relaxed max-w-md mx-auto md:mx-0">{description}</p>
    </div>
  )

  // Mobile always stacks image-then-text in the same order for a
  // predictable reading flow; only the desktop side (right/left) alternates.
  return (
    <div className={`flex flex-col md:flex-row items-center gap-8 md:gap-14 ${imageOnRight ? 'md:flex-row-reverse' : ''}`}>
      {imageBlock}
      {textBlock}
    </div>
  )
}

export function LandingShipmentDetailsSections() {
  return (
    <section className="max-w-6xl mx-auto px-5 py-16 md:py-20 flex flex-col gap-16 md:gap-24">
      <AlternatingRow
        title={SHIPMENT_DETAILS_SECTION.title}
        description={SHIPMENT_DETAILS_SECTION.description}
        imageFallback={packingFallback}
        imageMobile={packingMobile}
        imageDesktop={packingDesktop}
        imageAlt="صورة توضيحية لتجهيز وتغليف شحنة"
        imageOnRight={false}
      />
      <AlternatingRow
        title={CUSTOMER_EXPERIENCE_SECTION.title}
        description={CUSTOMER_EXPERIENCE_SECTION.description}
        imageFallback={deliveryFallback}
        imageMobile={deliveryMobile}
        imageDesktop={deliveryDesktop}
        imageAlt="صورة توضيحية لتسليم طرد للعميل"
        imageOnRight
      />
    </section>
  )
}
