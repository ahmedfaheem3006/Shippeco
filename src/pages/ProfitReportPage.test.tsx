import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { AppLayout } from '../components/AppLayout/AppLayout'
import { ProfitReportPage } from './ProfitReportPage'

vi.mock('../services/dbService', () => {
  return {
    fetchDbInvoices: vi.fn(async () => [
      { id: '1', client: 'Ali', date: '2026-03-18', status: 'paid', price: 200, dhlCost: 150 },
      { id: '2', client: 'Sara', date: '2026-03-17', status: 'unpaid', price: 100, dhlCost: 0 },
    ]),
  }
})

describe('ProfitReportPage', () => {
  it('renders summary cards', async () => {
    render(
      <MemoryRouter initialEntries={['/profit-report']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/profit-report" element={<ProfitReportPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('الإيرادات')).toBeInTheDocument()
    expect((await screen.findAllByText('تكلفة DHL')).length).toBeGreaterThan(0)
    expect(await screen.findByText('إجمالي الربح الصافي')).toBeInTheDocument()
  })
})
