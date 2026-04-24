import { useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, BarChart3, Users, PlusCircle,
  Calculator, ClipboardCheck, TrendingUp, ClipboardList,
  FileCode, MessageSquare, CreditCard, Settings, LogOut
} from 'lucide-react'
import shippecLogo from '../../assets/shippec.jpeg'
import { useAuthStore } from '../../hooks/useAuthStore'

type Props = {
  onNavigate?: () => void
}

function isActivePath(currentPath: string, targetPath: string) {
  return currentPath.includes(targetPath) && targetPath !== '/'
}

export function Sidebar({ onNavigate }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const go = (to: string) => {
    navigate(to)
    onNavigate?.()
  }

  const navItemClass = (path: string, primary = false) => {
    const isActive = path === '/dashboard' ? location.pathname === '/dashboard' || location.pathname === '/' : isActivePath(location.pathname, path);
    return `flex items-center gap-3 px-4 py-3 mx-3 my-1 rounded-xl transition-all duration-200 cursor-pointer text-sm font-semibold border-l-4
      ${isActive
        ? primary ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 border-indigo-600' : 'bg-indigo-50 dark:bg-slate-800/80 text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400'
        : 'border-transparent text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'
      }`
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900/95 border-l border-gray-200 dark:border-slate-800 shadow-sm w-64 overflow-y-auto hidden-scrollbar">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-gray-200 dark:border-slate-800">
        <img src={shippecLogo} alt="Shippeco" className="w-11 h-11 rounded-xl object-cover shadow-md ring-2 ring-indigo-100 dark:ring-slate-700" />
        <div>
          <div className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            Ship<span className="text-indigo-600 dark:text-indigo-400">peco</span>
          </div>
          <div className="text-[10px] text-gray-500 dark:text-slate-400 font-medium uppercase tracking-widest">Shipping Management</div>
        </div>
      </div>

      <nav className="flex-1 py-4 flex flex-col gap-1">
        <div className="px-6 py-2 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">عام</div>
        <button className={navItemClass('/dashboard')} onClick={() => go('/dashboard')}>
          <LayoutDashboard size={20} /> عرض اللوحة
        </button>
        <button className={navItemClass('/invoices')} onClick={() => go('/invoices')}>
          <FileText size={20} /> الفواتير
        </button>
        <button className={navItemClass('/reports')} onClick={() => go('/reports')}>
          <BarChart3 size={20} /> التقارير
        </button>
        <button className={navItemClass('/clients')} onClick={() => go('/clients')}>
          <Users size={20} /> العملاء
        </button>
        <button
          className={navItemClass('/new-invoice', true)}
          onClick={() => go('/new-invoice')}
        >
          <PlusCircle size={20} /> فاتورة جديدة
        </button>

        <div className="my-2 border-t border-gray-100 dark:border-slate-800 mx-4"></div>
        <div className="px-6 py-2 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">أدوات</div>

        <button className={navItemClass('/calculator')} onClick={() => go('/calculator')}>
          <Calculator size={20} /> حاسبة DHL
        </button>
        <button className={navItemClass('/reconcile')} onClick={() => go('/reconcile')}>
          <ClipboardCheck size={20} /> مطابقة الفواتير
        </button>
        <button className={navItemClass('/profit-report')} onClick={() => go('/profit-report')}>
          <TrendingUp size={20} /> تقرير الربحية
        </button>
        <button className={navItemClass('/audit-log')} onClick={() => go('/audit-log')}>
          <ClipboardList size={20} /> سجل العمليات
        </button>
        <button className={navItemClass('/invoice-template')} onClick={() => go('/invoice-template')}>
          <FileCode size={20} /> قالب الفاتورة
        </button>
        <button className={navItemClass('/wa-templates')} onClick={() => go('/wa-templates')}>
          <MessageSquare size={20} /> قوالب واتساب
        </button>

        <div className="my-2 border-t border-gray-100 dark:border-slate-800 mx-4"></div>
        <div className="px-6 py-2 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">بوابة الدفع</div>

        <button className={navItemClass('/paymob-links')} onClick={() => go('/paymob-links')}>
          <CreditCard size={20} /> روابط Paymob
        </button>

        <div className="my-2 border-t border-gray-100 dark:border-slate-800 mx-4"></div>

        <button className={navItemClass('/settings')} onClick={() => go('/settings')}>
          <Settings size={20} /> الإعدادات
        </button>
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-slate-800 mt-auto bg-gray-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 flex items-center justify-center font-bold text-lg">
            {(user?.name || user?.username || 'م').trim()[0] || 'م'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{user?.name || user?.username || 'الموظف'}</div>
            <div className="text-xs text-gray-500 dark:text-slate-400 truncate">
              {user?.role === 'admin' ? 'مدير النظام' : user?.role === 'accountant' ? 'محاسب' : user?.role === 'viewer' ? 'مشاهد فقط' : 'موظف شحن'}
            </div>
          </div>
          <button
            onClick={() => { logout(); go('/login'); }}
            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title="تسجيل الخروج"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}