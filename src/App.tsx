import { lazy, Suspense, type ReactNode } from 'react'
import { canSupport } from './utils/support'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout/AppLayout'
import { NotFoundPage } from './pages/NotFoundPage'
import { useAuthStore } from './hooks/useAuthStore'
import { SocketProvider } from './contexts/SocketContext'
import { Toaster } from 'react-hot-toast'
import { PublicHomePage } from './pages/PublicHomePage'

// Route-level code splitting: the public homepage ("/") — the one page a
// crawler or a first-time visitor actually loads cold — has no business
// paying for the entire authenticated app's JS (every page, every modal,
// every service) just to paint. Everything below is fetched only once its
// own route is actually visited. Named exports, so each needs its own
// `.then()` mapped to `default` for React.lazy().
const AuditLogPage = lazy(() => import('./pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })))
const CalculatorPage = lazy(() => import('./pages/CalculatorPage').then((m) => ({ default: m.CalculatorPage })))
const ClientsPage = lazy(() => import('./pages/ClientsPage').then((m) => ({ default: m.ClientsPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const InvoiceTemplatePage = lazy(() => import('./pages/InvoiceTemplatePage').then((m) => ({ default: m.InvoiceTemplatePage })))
const InvoicesPage = lazy(() => import('./pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage })))
const NewInvoicePage = lazy(() => import('./pages/NewInvoicePage').then((m) => ({ default: m.NewInvoicePage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const PaymobLinksPage = lazy(() => import('./pages/PaymobLinksPage').then((m) => ({ default: m.PaymobLinksPage })))
const ProfitReportPage = lazy(() => import('./pages/ProfitReportPage').then((m) => ({ default: m.ProfitReportPage })))
const ReconcilePage = lazy(() => import('./pages/ReconcilePage').then((m) => ({ default: m.ReconcilePage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const WaTemplatesPage = lazy(() => import('./pages/WaTemplatesPage').then((m) => ({ default: m.WaTemplatesPage })))
const TasksPage = lazy(() => import('./pages/TasksPage').then((m) => ({ default: m.TasksPage })))
const CollectionModelPage = lazy(() => import('./pages/CollectionModelPage').then((m) => ({ default: m.CollectionModelPage })))
const ExpensesPage = lazy(() => import('./pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage })))
const PublicPayPage = lazy(() => import('./pages/PublicPayPage').then((m) => ({ default: m.PublicPayPage })))
const QuoteRequestsPage = lazy(() => import('./pages/QuoteRequestsPage').then((m) => ({ default: m.QuoteRequestsPage })))
const SupportCenterPage = lazy(() => import('./pages/SupportCenterPage').then((m) => ({ default: m.SupportCenterPage })))

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// Same permission the Backend enforces on the quote-requests review
// endpoints (requireRole('admin', 'manager') in quoteRequests.routes.ts).
function RequireAdminOrManager({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)

  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

// support.view — same role map the Backend enforces on /api/support/*.
function RequireSupportView({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user || !canSupport(user.role, 'support.view')) return <Navigate to="/dashboard" replace />
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
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<PublicHomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pay/:id" element={<PublicPayPage />} />

        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/new-invoice" element={<NewInvoicePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/collection-model" element={<CollectionModelPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/reconcile" element={<ReconcilePage />} />
          <Route path="/invoice-template" element={<InvoiceTemplatePage />} />
          <Route path="/paymob-links" element={<PaymobLinksPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profit-report" element={<ProfitReportPage />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/wa-templates" element={<WaTemplatesPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route
            path="/support"
            element={
              <RequireSupportView>
                <SupportCenterPage />
              </RequireSupportView>
            }
          />
          <Route
            path="/quote-requests"
            element={
              <RequireAdminOrManager>
                <QuoteRequestsPage />
              </RequireAdminOrManager>
            }
          />
        </Route>

        {/* Top-level catch-all: an unmatched path shows a real "not found"
            page for everyone, instead of the previous behavior of bouncing
            unauthenticated visitors to /login (a soft-404 that also hides
            genuine 404s from search engines). */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  </SocketProvider>
  )
}

export default App
