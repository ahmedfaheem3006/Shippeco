import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { AppLayout } from '../components/AppLayout/AppLayout'
import { ProfitReportPage } from './ProfitReportPage'

vi.mock('../utils/apiClient', () => {
  return {
    api: {
      get: vi.fn(async (url: string) => {
        if (url.includes('/invoices/profit-data')) {
          return {
            summary: {
              totalCount: 2,
              revenue: 300,
              countedCount: 1,
              uncountedCount: 1,
              cost: 150,
              profit: 50,
              avgMarginPct: 33.3,
              losingCount: 0,
              bestMargin: 33.3,
              worstMargin: 33.3,
              avgProfit: 50,
            },
            invoices: [
              { id: 1, client: 'Ali', date: '2026-03-18', status: 'paid', price: 200, dhlCost: 150 },
              { id: 2, client: 'Sara', date: '2026-03-17', status: 'unpaid', price: 100, dhlCost: 0 },
            ],
            chartData: [],
            clientRows: [],
            pagination: { page: 1, limit: 50, total: 2, pages: 1 }
          }
        }
        return {}
      }),
    }
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
    expect((await screen.findAllByText('صافي الربح')).length).toBeGreaterThan(0)
  })
})
