import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NotFoundPage } from './NotFoundPage'
import { CONTACT } from '../content/landingPageContent'
import { decideBack } from '../utils/safeBack'

afterEach(() => cleanup())

function setHead() {
  document.head.innerHTML = `
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://shippec.com/" />
    <meta property="og:url" content="https://shippec.com/" />`
  document.title = 'شيب بيك'
}

describe('NotFoundPage', () => {
  it('renders the copy, a single h1, and real links that work without JS', () => {
    setHead()
    render(<NotFoundPage />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('يبدو أن هذه الصفحة خارج المسار')
    expect(screen.getByText('404 — الصفحة غير موجودة')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /العودة للرئيسية/ })).toHaveAttribute('href', '/')
    // Without JS the back link degrades to the homepage.
    expect(screen.getByRole('link', { name: /الرجوع للخلف/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /تواصل معنا/ })).toHaveAttribute('href', CONTACT.whatsappLink)
  })

  it('sets the 404 title + noindex and removes canonical/og:url while shown, then restores them', () => {
    setHead()
    const { unmount } = render(<NotFoundPage />)
    expect(document.title).toBe('الصفحة غير موجودة | SHIPPEC')
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow')
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.head.querySelector('meta[property="og:url"]')).toBeNull()

    unmount()
    expect(document.title).toBe('شيب بيك')
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://shippec.com/')
    expect(document.head.querySelector('meta[property="og:url"]')).not.toBeNull()
  })

  it('hides the decorative 404 numeral and illustrations from screen readers', () => {
    setHead()
    const { container } = render(<NotFoundPage />)
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })
})

describe('decideBack', () => {
  const here = 'https://shippec.com/some/missing-page'

  it('steps back when React Router recorded an earlier in-app entry', () => {
    expect(decideBack({ historyIdx: 2, referrer: '', currentHref: here })).toBe('history')
  })

  it('steps back to a previous page of the same site (full page load)', () => {
    expect(decideBack({ historyIdx: undefined, referrer: 'https://shippec.com/', currentHref: here })).toBe('history')
  })

  it('goes home when arriving from another site, directly, or when the referrer is this same page', () => {
    expect(decideBack({ historyIdx: 0, referrer: 'https://www.google.com/', currentHref: here })).toBe('home')
    expect(decideBack({ historyIdx: undefined, referrer: '', currentHref: here })).toBe('home')
    expect(decideBack({ historyIdx: 0, referrer: here, currentHref: here })).toBe('home')
    expect(decideBack({ historyIdx: 0, referrer: 'not a url', currentHref: here })).toBe('home')
    // Look-alike domain is not "this site".
    expect(decideBack({ historyIdx: 0, referrer: 'https://shippec.com.evil.net/', currentHref: here })).toBe('home')
  })
})
