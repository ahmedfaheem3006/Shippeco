import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout/AppLayout'
import { AuditLogPage } from './pages/AuditLogPage'
import { CalculatorPage } from './pages/CalculatorPage'
import { ClientsPage } from './pages/ClientsPage'
import { DashboardPage } from './pages/DashboardPage'
import { InvoiceTemplatePage } from './pages/InvoiceTemplatePage'
import { InvoicesPage } from './pages/InvoicesPage'
import { NewInvoicePage } from './pages/NewInvoicePage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PaymobLinksPage } from './pages/PaymobLinksPage'
import { ProfitReportPage } from './pages/ProfitReportPage'
import { ReconcilePage } from './pages/ReconcilePage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { WaTemplatesPage } from './pages/WaTemplatesPage'
import { TasksPage } from './pages/TasksPage'
import { useAuthStore } from './hooks/useAuthStore'
import { SocketProvider } from './contexts/SocketContext'
import { Toaster } from 'react-hot-toast'

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)

  if (!user) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

function App() {
  return (
    <SocketProvider>
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: 6000,
          style: {
            background: '#333',
            color: '#fff',
            borderRadius: '12px',
          },
          success: {
            style: {
              background: '#059669',
            },
          },
          error: {
            style: {
              background: '#dc2626',
            },
          },
        }}
      >
        {(t) => (
          <div
            style={{
              opacity: t.visible ? 1 : 0,
              transform: t.visible ? 'translateY(0)' : 'translateY(-20px)',
              transition: 'all 0.3s ease',
              background: t.type === 'error' ? '#fee2e2' : t.type === 'success' ? '#ecfdf5' : '#fff',
              color: t.type === 'error' ? '#991b1b' : t.type === 'success' ? '#065f46' : '#1f2937',
              padding: '12px 16px',
              borderRadius: '12px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              border: `1px solid ${t.type === 'error' ? '#fecaca' : t.type === 'success' ? '#a7f3d0' : '#e5e7eb'}`,
              fontWeight: 600,
              fontSize: '14px',
              pointerEvents: 'auto',
            }}
          >
            {t.type === 'loading' && <div className="w-4 h-4 border-2 border-current border-t-transparent animate-spin rounded-full" />}
            {t.message as any}
            <button
              onClick={() => {
                import('react-hot-toast').then(({ toast }) => toast.dismiss(t.id));
              }}
              style={{
                marginLeft: 'auto',
                padding: '4px',
                borderRadius: '50%',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                color: 'inherit',
                opacity: 0.6,
              }}
              onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseOut={(e) => (e.currentTarget.style.opacity = '0.6')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        )}
      </Toaster>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/new-invoice" element={<NewInvoicePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/reconcile" element={<ReconcilePage />} />
          <Route path="/invoice-template" element={<InvoiceTemplatePage />} />
          <Route path="/paymob-links" element={<PaymobLinksPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profit-report" element={<ProfitReportPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/wa-templates" element={<WaTemplatesPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  </SocketProvider>
  )
}

export default App
