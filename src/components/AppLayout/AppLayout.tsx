import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Sidebar } from '../Sidebar/Sidebar';
import { useTheme } from '../../hooks/useTheme';
import {
  Menu, Moon, Sun, Bell, LayoutDashboard, FileText,
  Users, BarChart3, MoreHorizontal, CheckCheck,
  FileCode, Calculator, CreditCard, Settings as SettingsIcon,
  ClipboardCheck, TrendingUp, ClipboardList, MessageSquare,
  Check,
} from 'lucide-react';
import { useAuthStore } from '../../hooks/useAuthStore';
import shippecLogo from '../../assets/shippec.jpeg';
import { useNotifications } from '../../hooks/useNotifications';

/* ═══ Notification type → icon & route mapping ═══ */
const NOTIF_CONFIG: Record<string, {
  icon: any;
  color: string;
  route: string;
}> = {
  new_user:        { icon: Users,          color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',   route: '/settings' },
  user_approved:   { icon: Check,          color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',   route: '/dashboard' },
  user_rejected:   { icon: Users,          color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',           route: '/dashboard' },
  invoice_created: { icon: FileText,       color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',       route: '/invoices' },
  invoice_paid:    { icon: CreditCard,     color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',   route: '/invoices' },
  payment_link:    { icon: CreditCard,     color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400', route: '/paymob-links' },
  sync_complete:   { icon: ClipboardCheck, color: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',       route: '/settings' },
  report_ready:    { icon: BarChart3,      color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400', route: '/reports' },
  reconcile:       { icon: ClipboardList,  color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400', route: '/reconcile' },
  default:         { icon: Bell,           color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400', route: '/dashboard' },
};

function getNotifConfig(type: string) {
  return NOTIF_CONFIG[type] || NOTIF_CONFIG.default;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  if (diffHr < 24) return `منذ ${diffHr} ساعة`;
  if (diffDay < 7) return `منذ ${diffDay} يوم`;
  return new Date(dateStr).toLocaleDateString('ar-EG');
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);

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
  };

  const pageTitle = getPageTitle(location.pathname);

  /* ── Handle notification click ── */
  const handleNotifClick = (n: typeof notifications[0]) => {
    // Mark as read if not already
    if (!n.is_read) {
      markAsRead(n.id);
    }

    // Navigate to the relevant page
    const config = getNotifConfig(n.type);
    let targetRoute = config.route;

    // If notification has specific data, use it for more precise navigation
    if (n.data) {
      if (n.data.invoice_id && (n.type === 'invoice_created' || n.type === 'invoice_paid')) {
        targetRoute = `/invoices`;
      }
      if (n.data.route) {
        targetRoute = n.data.route;
      }
    }

    setNotifOpen(false);
    navigate(targetRoute);
  };

  const bottomNavItem = (path: string, Icon: any, label: string) => {
    const isActive = location.pathname.includes(path);
    return (
      <button
        onClick={() => navigate(path)}
        className={`flex flex-col items-center justify-center gap-1 w-full h-full text-[10px] sm:text-xs transition-colors ${
          isActive
            ? 'text-indigo-600 dark:text-indigo-400 font-bold'
            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
        }`}
      >
        <Icon size={20} className={isActive ? 'text-indigo-600 dark:text-indigo-400' : ''} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div
      className="flex h-screen w-full bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-gray-100 overflow-hidden font-cairo"
      dir="rtl"
    >
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-64 transform lg:transform-none lg:static transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        {/* ═══ Top Navbar ═══ */}
        <header className="h-16 flex items-center justify-between px-4 lg:px-6 bg-white dark:bg-slate-800 shadow shadow-gray-200/50 dark:shadow-slate-900/50 sticky top-0 z-30 transition-colors">
          <div className="flex items-center gap-3">
            <button
              title="القائمة"
              onClick={() => setSidebarOpen(true)}
              className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg lg:hidden transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
              <img src={shippecLogo} alt="Shippeco" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-none hidden sm:block">
              {pageTitle}
            </h1>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white sm:hidden">{pageTitle}</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Theme Toggle */}
            <button
              onClick={() => toggleTheme()}
              className="p-2 rounded-full text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-slate-700 transition-all"
              title="تبديل المظهر"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* ═══ Notifications Bell ═══ */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-full text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-slate-700 transition-all"
                title="الإشعارات"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 px-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-800 animate-pulse">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* ═══ Notifications Dropdown ═══ */}
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute left-0 mt-2 w-80 sm:w-[400px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
                    {/* Header */}
                    <div className="p-4 bg-gray-50/80 dark:bg-slate-800/80 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bell size={16} className="text-indigo-600 dark:text-indigo-400" />
                        <h3 className="font-bold text-sm text-gray-900 dark:text-white">الإشعارات</h3>
                        {unreadCount > 0 && (
                          <span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllAsRead()}
                          className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                        >
                          <CheckCheck size={14} />
                          قراءة الكل
                        </button>
                      )}
                    </div>

                    {/* Notifications List */}
                    <div className="max-h-[400px] overflow-y-auto">
                      {notifications && notifications.length > 0 ? (
                        notifications.map((n) => {
                          const config = getNotifConfig(n.type);
                          const Icon = config.icon;

                          return (
                            <div
                              key={n.id}
                              onClick={() => handleNotifClick(n)}
                              className={`relative flex items-start gap-3 p-4 cursor-pointer transition-all duration-200 border-b border-gray-50 dark:border-slate-700/50 last:border-0 group ${
                                !n.is_read
                                  ? 'bg-indigo-50/40 dark:bg-indigo-900/10 hover:bg-indigo-50/70 dark:hover:bg-indigo-900/20'
                                  : 'hover:bg-gray-50 dark:hover:bg-slate-700/30'
                              }`}
                            >
                              {/* Unread indicator dot */}
                              {!n.is_read && (
                                <div className="absolute top-4 right-2 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                              )}

                              {/* Icon */}
                              <div className={`p-2 rounded-xl flex-shrink-0 ${config.color} ${n.is_read ? 'opacity-60' : ''}`}>
                                <Icon size={16} />
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className={`text-xs font-bold truncate ${
                                    n.is_read
                                      ? 'text-gray-500 dark:text-gray-400'
                                      : 'text-gray-900 dark:text-white'
                                  }`}>
                                    {n.title}
                                  </p>
                                </div>
                                {n.message && (
                                  <p className={`text-[11px] line-clamp-2 leading-relaxed ${
                                    n.is_read
                                      ? 'text-gray-400 dark:text-gray-500'
                                      : 'text-gray-600 dark:text-gray-300'
                                  }`}>
                                    {n.message}
                                  </p>
                                )}
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 font-medium">
                                  {timeAgo(n.created_at)}
                                </p>
                              </div>

                              {/* Read status indicator */}
                              <div className="flex-shrink-0 self-center">
                                {n.is_read ? (
                                  <div className="p-1 rounded-full text-green-500 dark:text-green-400" title="مقروء">
                                    <Check size={14} />
                                  </div>
                                ) : (
                                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 group-hover:scale-110 transition-transform" title="غير مقروء" />
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex flex-col items-center justify-center p-10 text-gray-400 dark:text-gray-500">
                          <Bell size={28} className="mb-3 opacity-30" />
                          <p className="text-xs font-bold">لا يوجد إشعارات</p>
                          <p className="text-[10px] mt-1">ستظهر الإشعارات الجديدة هنا</p>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                      <div className="p-3 bg-gray-50/50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-700 text-center">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                          آخر {notifications.length} إشعار
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="h-8 w-[1px] bg-gray-200 dark:bg-slate-700 mx-1 hidden sm:block" />

            {/* User Info */}
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

        {/* ═══ Main Content ═══ */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 space-y-6 pb-24 lg:pb-8 bg-gray-50 dark:bg-slate-900 relative scroll-smooth transition-all duration-200">
          <Outlet context={{ openSidebar: () => setSidebarOpen(true) }} />
        </main>

        {/* ═══ Mobile Bottom Nav ═══ */}
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
  );
}