import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Sidebar } from '../Sidebar/Sidebar'
import { useTheme } from '../../hooks/useTheme'
import { Menu, Moon, Sun, Bell, LayoutDashboard, FileText, Users, BarChart3, MoreHorizontal } from 'lucide-react'
import { useAuthStore } from '../../hooks/useAuthStore'
import shippecLogo from '../../assets/shippec.jpeg'
import { useNotifications } from '../../hooks/useNotifications'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const user = useAuthStore((s) => s.user)
  const { notifications, unreadCount, markAsRead } = useNotifications()
  const [notifOpen, setNotifOpen] = useState(false)

  const getPageTitle = (path: string) => {
    if (path.includes('/dashboard')) return 'لوحة التحكم';
    if (path.includes('/new-invoice')) return 'إنشاء فاتورة جديدة';
    if (path.includes('/invoices')) return 'إدارة الفواتير';
    if (path.includes('/reports')) return 'التقارير الشاملة';
    if (path.includes('/clients')) return 'إدارة العملاء';
    if (path.includes('/calculator')) return 'حاسبة الشحن';
    if (path.includes('/reconcile')) return 'مطابقة الفواتير';
    if (path.includes('/profit-report')) return 'تقرير الربحية';
    if (path.includes('/audit-log')) return 'سجل العمليات';
    if (path.includes('/settings')) return 'إعدادات النظام';
    if (path.includes('/log')) return 'سجل العمليات';
    if (path.includes('/wa')) return 'قوالب واتساب';
    if (path.includes('/paymob')) return 'روابط Paymob';
    if (path.includes('/template')) return 'قالب الفاتورة';
    return 'الرئيسية';
  }

  const pageTitle = getPageTitle(location.pathname)

  const bottomNavItem = (path: string, Icon: any, label: string) => {
    const isActive = location.pathname.includes(path)
    return (
      <button
        onClick={() => navigate(path)}
        className={`flex flex-col items-center justify-center gap-1 w-full h-full text-[10px] sm:text-xs transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}
      >
        <Icon size={20} className={isActive ? 'text-indigo-600 dark:text-indigo-400' : ''} />
        <span>{label}</span>
      </button>
    )
  }

  return (
    <div className="flex h-screen w-full bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-gray-100 overflow-hidden font-cairo" dir="rtl">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`fixed inset-y-0 right-0 z-50 w-64 transform lg:transform-none lg:static transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        {/* Top Navbar with Logo */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-6 bg-white dark:bg-slate-800 shadow shadow-gray-200/50 dark:shadow-slate-900/50 sticky top-0 z-30 transition-colors">
          <div className="flex items-center gap-3">
            <button
            title='imm'
              onClick={() => setSidebarOpen(true)}
              className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg lg:hidden transition-colors"
            >
              <Menu size={20} />
            </button>
            {/* Logo in navbar — visible on mobile when sidebar is hidden */}
            <div className="flex items-center gap-2 lg:hidden">
              <img src={shippecLogo} alt="Shippeco" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-none hidden sm:block">{pageTitle}</h1>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white sm:hidden">{pageTitle}</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => toggleTheme()}
              className="p-2 rounded-full text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-slate-700 transition-all"
              title="تبديل المظهر"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <div className="relative">
              <button 
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-full text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-slate-700 transition-all"
                title="الإشعارات"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 px-1 min-w-[16px] h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-800">
                    {unreadCount > 9 ? '+9' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
                    <div className="p-4 bg-gray-50/50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                       <h3 className="font-bold text-sm">الإشعارات</h3>
                       <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">{unreadCount} غير مقروء</span>
                    </div>
                    <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-50 dark:divide-slate-700/50">
                      {notifications && notifications.length > 0 ? (
                        notifications.map((n) => (
                          <div 
                            key={n.id} 
                            onClick={() => {
                              markAsRead(n.id)
                              if (n.type === 'new_user') navigate('/settings')
                              setNotifOpen(false)
                            }}
                            className={`p-4 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors ${!n.is_read ? 'bg-indigo-50/20' : ''}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg flex-shrink-0 ${n.type === 'new_user' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                <Users size={16} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-900 dark:text-white mb-1">{n.title}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">{n.message}</p>
                                <p className="text-[9px] text-gray-400 mt-2 font-inter">{new Date(n.created_at).toLocaleString('ar-EG')}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-gray-400">
                          <p className="text-xs font-bold">لا يوجد إشعارات جديدة</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="h-8 w-[1px] bg-gray-200 dark:bg-slate-700 mx-1 hidden sm:block"></div>

            <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 px-2 py-1 rounded-lg transition-colors">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-bold flex items-center justify-center text-sm">
                {(user?.name || user?.username || 'A')[0]}
              </div>
              <span className="hidden sm:block text-sm font-semibold text-gray-700 dark:text-gray-300">
                {user?.name || user?.username || 'الموظف'}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 space-y-6 pb-24 lg:pb-8 bg-gray-50 dark:bg-slate-900 relative scroll-smooth transition-all duration-200">
          <Outlet context={{ openSidebar: () => setSidebarOpen(true) }} />
        </main>

        <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] z-40 flex items-center justify-around px-2 pb-safe">
          {bottomNavItem('/dashboard', LayoutDashboard, 'الرئيسية')}
          {bottomNavItem('/invoices', FileText, 'الفواتير')}
          {bottomNavItem('/clients', Users, 'العملاء')}
          {bottomNavItem('/reports', BarChart3, 'التقارير')}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center justify-center gap-1 w-full h-full text-[10px] sm:text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
          >
            <MoreHorizontal size={20} />
            <span>المزيد</span>
          </button>
        </div>
      </div>
    </div>
  )
}