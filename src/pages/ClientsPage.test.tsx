import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppLayout } from '../components/AppLayout/AppLayout'
import { ClientsPage } from './ClientsPage'

vi.mock('../services/dbService', () => {
  return {
    fetchDbInvoices: vi.fn(async () => [
      { id: '1', client: 'Ali', phone: '050', date: '2026-03-18', status: 'paid', price: 100 },
      { id: '2', client: 'Sara', phone: '055', date: '2026-03-17', status: 'unpaid', price: 50 },
    ]),
  }
})

describe('ClientsPage', () => {
  it('renders clients and shows details when selecting a client', async () => {
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/clients" element={<ClientsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const ali = await screen.findByText('Ali')
    await userEvent.click(ali)

    expect(await screen.findByText(/#1/)).toBeInTheDocument()
  })
})

