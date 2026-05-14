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
function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)

  if (!user) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

function App() {
  return (
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
  )
}

export default App
