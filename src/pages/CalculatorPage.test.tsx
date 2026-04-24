import { describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppLayout } from '../components/AppLayout/AppLayout'
import { CalculatorPage } from './CalculatorPage'

describe('CalculatorPage', () => {
  it('calculates a price for a simple piece', async () => {
    render(
      <MemoryRouter initialEntries={['/calculator']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/calculator" element={<CalculatorPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const weightInputs = screen.getAllByPlaceholderText('0.0')
    await userEvent.clear(weightInputs[0])
    await userEvent.type(weightInputs[0], '10')

    await userEvent.click(screen.getByRole('button', { name: '🧮 احسب السعر' }))

    expect(await screen.findByText('السعر النهائي للعميل')).toBeInTheDocument()
    expect(await screen.findByText(/562\.71/)).toBeInTheDocument()
  })
})

