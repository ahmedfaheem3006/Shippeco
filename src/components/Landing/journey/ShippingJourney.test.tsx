import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'framer-motion'
import { LandingShippingJourney } from './ShippingJourney'
import { PhoneField } from '../../shared/PhoneField'

MotionGlobalConfig.skipAnimations = true

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function okResponse() {
  return Promise.resolve(new Response(JSON.stringify({ success: true, data: { id: 1 } }), { status: 201 }))
}
function failResponse() {
  return Promise.resolve(new Response(JSON.stringify({ success: false, error: { message: 'boom' } }), { status: 500 }))
}

async function pickCountry(user: ReturnType<typeof userEvent.setup>, fieldLabel: RegExp, countryName: string) {
  await user.click(screen.getByRole('button', { name: fieldLabel }))
  await user.click(await screen.findByRole('option', { name: new RegExp(countryName) }))
}

describe('LandingShippingJourney', () => {
  it('reveals shipment type only after both countries are chosen', async () => {
    const user = userEvent.setup()
    render(<LandingShippingJourney />)
    expect(screen.queryByText('ما نوع شحنتك؟')).not.toBeInTheDocument()

    await pickCountry(user, /^الاستلام من/, 'السعودية')
    expect(screen.queryByText('ما نوع شحنتك؟')).not.toBeInTheDocument()

    await pickCountry(user, /^التسليم إلى/, 'مصر')
    expect(await screen.findByText('ما نوع شحنتك؟')).toBeInTheDocument()
  })

  it('adds and removes packages without ever removing the last one, and keeps data when going back', async () => {
    const user = userEvent.setup()
    render(<LandingShippingJourney />)
    await pickCountry(user, /^الاستلام من/, 'السعودية')
    await pickCountry(user, /^التسليم إلى/, 'مصر')
    await user.click(screen.getByRole('button', { name: /طرد/ }))
    await user.click(screen.getByRole('button', { name: /متابعة/ }))

    expect(await screen.findByText('الطرد 1')).toBeInTheDocument()
    // Only one package: no delete button.
    expect(screen.queryByRole('button', { name: /حذف الطرد 1/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /إضافة طرد آخر/ }))
    expect(await screen.findByText('الطرد 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /حذف الطرد 2/ }))
    await waitFor(() => expect(screen.queryByText('الطرد 2')).not.toBeInTheDocument())

    // Type a weight, go back, come forward again: the value is still there.
    const weight = screen.getAllByLabelText(/الوزن \(كجم\)/)[0]
    await user.type(weight, '٣')
    expect(weight).toHaveValue('3')
    await user.click(screen.getByRole('button', { name: /السابق/ }))
    await user.click(await screen.findByRole('button', { name: /متابعة/ }))
    expect(screen.getAllByLabelText(/الوزن \(كجم\)/)[0]).toHaveValue('3')
  })

  it('shows validation errors only after trying to continue', async () => {
    const user = userEvent.setup()
    render(<LandingShippingJourney />)
    await pickCountry(user, /^الاستلام من/, 'السعودية')
    await pickCountry(user, /^التسليم إلى/, 'مصر')
    await user.click(screen.getByRole('button', { name: /طرد/ }))
    await user.click(screen.getByRole('button', { name: /متابعة/ }))
    await screen.findByText('الطرد 1')

    expect(screen.queryByText(/أدخل الوزن بالأرقام/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /متابعة/ }))
    expect(await screen.findByText(/أدخل الوزن بالأرقام/)).toBeInTheDocument()
    expect(screen.queryByText('كيف تفضّل المتابعة؟')).not.toBeInTheDocument()
  })

  it('"تواصلوا معي" needs only name + phone, sends once, and shows success only after the server confirms', async () => {
    let resolveFetch: (r: Response) => void = () => {}
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (resolveFetch = r)))
    const user = userEvent.setup()
    render(<LandingShippingJourney />)

    // Straight to the contact path without any route or measurements.
    await user.click(screen.getByRole('button', { name: /تواصلوا معي/ }))
    await user.type(await screen.findByLabelText(/^الاسم/), 'سارة')
    await user.type(document.getElementById('contact-phone') as HTMLElement, '0501234567')

    const submit = screen.getByRole('button', { name: /إرسال طلب التواصل/ })
    await user.click(submit)
    await user.click(submit) // double click while in flight
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/تم استلام طلبك/)).not.toBeInTheDocument()

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ request_type: 'contact', name: 'سارة', phone: '+966501234567' })
    expect(body.client_request_id).toBeTruthy()

    resolveFetch(new Response(JSON.stringify({ success: true, data: { id: 9 } }), { status: 201 }))
    expect(await screen.findByText(/تم استلام طلبك، وسيتواصل معك فريق شيب بيك/)).toBeInTheDocument()
  })

  it('keeps the visitor input and shows an error (no false success) when the API fails, then retries with the same idempotency key', async () => {
    fetchMock.mockImplementationOnce(failResponse).mockImplementationOnce(okResponse)
    const user = userEvent.setup()
    render(<LandingShippingJourney />)
    await user.click(screen.getByRole('button', { name: /تواصلوا معي/ }))
    await user.type(await screen.findByLabelText(/^الاسم/), 'سارة')
    await user.type(document.getElementById('contact-phone') as HTMLElement, '0501234567')
    await user.click(screen.getByRole('button', { name: /إرسال طلب التواصل/ }))
    expect(await screen.findByRole('alert', undefined, { timeout: 3000 })).toHaveTextContent('تعذر إرسال الطلب')
    expect(screen.queryByText(/تم استلام طلبك/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^الاسم/)).toHaveValue('سارة')

    await user.click(screen.getByRole('button', { name: /إرسال طلب التواصل/ }))
    expect(await screen.findByText(/تم استلام طلبك/)).toBeInTheDocument()
    const first = JSON.parse(fetchMock.mock.calls[0][1].body).client_request_id
    const second = JSON.parse(fetchMock.mock.calls[1][1].body).client_request_id
    expect(second).toBe(first)
  })
})

describe('PhoneField', () => {
  function Harness() {
    return (
      <PhoneField
        id="p"
        label="رقم الجوال"
        country="SA"
        onCountryChange={() => {}}
        rawValue=""
        onRawChange={() => {}}
      />
    )
  }

  it('does not render the country search box while closed', () => {
    render(<Harness />)
    expect(screen.queryByPlaceholderText(/ابحث بالاسم أو المفتاح/)).not.toBeInTheDocument()
    expect(document.getElementById('p')).toHaveAttribute('type', 'tel')
  })

  it('opens a searchable list (Arabic, English, dial code) and closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /\+966/ }))
    const search = await screen.findByPlaceholderText(/ابحث بالاسم أو المفتاح/)
    const list = screen.getByRole('listbox')
    // Saudi Arabia and Egypt first.
    const options = within(list).getAllByRole('option')
    expect(options[0]).toHaveTextContent('السعودية')
    expect(options[1]).toHaveTextContent('مصر')

    await user.type(search, 'Turkey')
    expect(within(list).getAllByRole('option')).toHaveLength(1)
    await user.clear(search)
    await user.type(search, '+20')
    expect(within(list).getByRole('option')).toHaveTextContent('مصر')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })
})
