import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppLayout } from '../components/AppLayout/AppLayout'
import { AuditLogPage } from './AuditLogPage'

vi.mock('../services/dbService', () => {
  return {
    fetchDbSettings: vi.fn(async () => [
      {
        key: 'erp_audit_log',
        value: JSON.stringify([
          { id: '1', type: 'create', at: '2026-03-18T10:00:00.000Z', user: 'admin', note: 'created invoice' },
          { id: '2', type: 'delete', at: '2026-03-18T11:00:00.000Z', user: 'admin', note: 'deleted invoice' },
        ]),
      },
    ]),
    saveDbSettings: vi.fn(async () => ({ ok: true })),
  }
})

describe('AuditLogPage', () => {
  it('filters by type', async () => {
    render(
      <MemoryRouter initialEntries={['/audit-log']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/audit-log" element={<AuditLogPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('created invoice')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '➕ إنشاء' }))
    expect(await screen.findByText('created invoice')).toBeInTheDocument()
    expect(screen.queryByText('deleted invoice')).toBeNull()
  })
})

