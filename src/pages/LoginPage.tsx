import { useLoginPage } from '../hooks/useLoginPage'
import { 
  Lock, User, Phone, Mail, RefreshCw, 
  Package, Shield, Eye, EyeOff, Truck, Globe, 
  ArrowRight, Sparkles, CheckCircle2
} from 'lucide-react'
import { useState } from 'react'
import shippecLogo from '../assets/shippec.jpeg'

export function LoginPage() {
  const lg = useLoginPage()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  return (
    <div className="min-h-screen flex flex-col lg:flex-row font-cairo" dir="rtl">

      {/* ═══════════════════════════════════════════
          LEFT SIDE — Branding Panel (hidden on mobile)
          ═══════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900">
        {/* Animated Background Elements */}
        <div className="absolute inset-0">
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" 
            style={{ 
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` 
            }} 
          />
          {/* Gradient orbs */}
          <div className="absolute top-1/4 -right-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 -left-20 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '4s' }} />
          
          {/* Floating shipping icons */}
          <div className="absolute top-[15%] right-[10%] text-white/5 animate-bounce" style={{ animationDuration: '6s' }}>
            <Package size={80} />
          </div>
          <div className="absolute bottom-[20%] left-[15%] text-white/5 animate-bounce" style={{ animationDuration: '8s', animationDelay: '1s' }}>
            <Truck size={60} />
          </div>
          <div className="absolute top-[60%] right-[25%] text-white/5 animate-bounce" style={{ animationDuration: '7s', animationDelay: '3s' }}>
            <Globe size={50} />
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-16">
          {/* Logo & Brand */}
          <div>
            <div className="flex items-center gap-4 mb-2">
              <img 
                src={shippecLogo} 
                alt="Shippeco" 
                className="w-14 h-14 rounded-2xl object-cover shadow-2xl ring-2 ring-white/10" 
              />
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight">ShipPec</h2>
                <p className="text-indigo-300/70 text-sm font-medium">Shipping Management Platform</p>
              </div>
            </div>
          </div>

          {/* Main Message */}
          <div className="space-y-8">
            <div>
              <h1 className="text-4xl xl:text-5xl font-black text-white leading-tight mb-4">
                أدِر شحناتك
                <br />
                <span className="bg-gradient-to-l from-indigo-400 via-sky-400 to-cyan-400 bg-clip-text text-transparent">
                  بذكاء وكفاءة
                </span>
              </h1>
              <p className="text-indigo-200/60 text-lg leading-relaxed max-w-md">
                منصة متكاملة لإدارة الشحن والفوترة والتحصيل — كل ما تحتاجه في مكان واحد
              </p>
            </div>

            {/* Feature Cards */}
            <div className="space-y-3">
              {[
                { icon: Package, title: 'إدارة الشحنات', desc: 'تتبع وإدارة كل شحناتك مع DHL وشركات الشحن' },
                { icon: Shield, title: 'تحصيل آمن', desc: 'روابط دفع Paymob ومتابعة التحصيل لحظياً' },
                { icon: Sparkles, title: 'تقارير ذكية', desc: 'تحليل الأرباح والمصروفات بدقة وشفافية' },
              ].map((feature, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.07] transition-all duration-300 group"
                >
                  <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/20 to-sky-500/20 text-indigo-300 group-hover:scale-110 transition-transform duration-300">
                    <feature.icon size={22} />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm">{feature.title}</h3>
                    <p className="text-indigo-300/50 text-xs leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 text-indigo-400/40 text-xs">
            <span>© 2026 ShipPec</span>
            <span>•</span>
            <span>Powered by التكامل التقني الدولي</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          RIGHT SIDE — Login Form
          ═══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col lg:flex-row lg:items-center lg:justify-center bg-gray-50 dark:bg-slate-950 relative overflow-hidden">
        {/* Subtle background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-indigo-50/30 to-gray-50 dark:from-slate-950 dark:via-indigo-950/20 dark:to-slate-950" />
        
        {/* Mobile branding (visible on mobile only) */}
        <div className="relative flex-shrink-0 lg:hidden">
          <div className="bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 px-6 pt-14 pb-12 text-center relative overflow-hidden" style={{ borderRadius: '0 0 2rem 2rem' }}>
            {/* Animated gradient orbs */}
            <div className="absolute top-0 -right-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-0 -left-10 w-32 h-32 bg-sky-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '3s' }} />
            {/* Grid pattern */}
            <div className="absolute inset-0 opacity-[0.04]"
              style={{ 
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M20 18v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
              }}
            />
            {/* Floating icons */}
            <div className="absolute top-4 right-6 text-white/[0.06] animate-bounce" style={{ animationDuration: '5s' }}>
              <Package size={28} />
            </div>
            <div className="absolute bottom-6 left-8 text-white/[0.06] animate-bounce" style={{ animationDuration: '7s', animationDelay: '1s' }}>
              <Truck size={24} />
            </div>
            <div className="relative z-10">
              <div className="relative inline-block mb-3">
                <div className="absolute -inset-2 bg-gradient-to-br from-indigo-500/30 to-sky-500/30 rounded-3xl blur-xl animate-pulse" />
                <img 
                  src={shippecLogo} 
                  alt="Shippeco" 
                  className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover shadow-2xl ring-2 ring-white/20" 
                />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">ShipPec</h2>
              <p className="text-indigo-300/70 text-xs sm:text-sm mt-1 font-medium">منصة إدارة الشحن والفوترة</p>
            </div>
          </div>
        </div>

        {/* Form Container */}
        <div className="relative z-10 w-full max-w-[420px] mx-auto px-5 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-0 flex-1 flex flex-col justify-center lg:flex-none">
          
          {/* Form Header */}
          <div className="text-center lg:text-right mb-8">
            <div className="hidden lg:flex items-center gap-3 mb-6">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                {lg.isRegister ? <User size={24} /> : <Lock size={24} />}
              </div>
              <div className="h-8 w-[1px] bg-gray-200 dark:bg-slate-700" />
              <img 
                src={shippecLogo} 
                alt="" 
                className="w-8 h-8 rounded-lg object-cover lg:hidden" 
              />
            </div>
            <h1 className="text-2xl lg:text-3xl font-black text-gray-900 dark:text-white mb-2">
              {lg.isRegister ? 'إنشاء حساب جديد' : 'مرحباً بعودتك'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              {lg.isRegister 
                ? 'أدخل بياناتك للانضمام لمنصة ShipPec' 
                : 'سجّل دخولك للوصول إلى لوحة التحكم'
              }
            </p>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            
            {/* Register-only fields */}
            {lg.isRegister && (
              <>
                {/* Full Name */}
                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400 mr-1">الاسم الكامل</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                      <User size={18} />
                    </div>
                    <input
                      className="w-full bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-xl py-3.5 pl-4 pr-12 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600"
                      value={lg.name}
                      onChange={(e) => lg.setName(e.target.value)}
                      placeholder="محمد أحمد"
                      disabled={lg.loading}
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300" style={{ animationDelay: '50ms' }}>
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400 mr-1">رقم الهاتف <span className="text-gray-400">(اختياري)</span></label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                      <Phone size={18} />
                    </div>
                    <input
                      className="w-full bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-xl py-3.5 pl-4 pr-12 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600 font-inter"
                      value={lg.phone}
                      onChange={(e) => lg.setPhone(e.target.value)}
                      placeholder="966501234567"
                      dir="ltr"
                      disabled={lg.loading}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-400 mr-1">البريد الإلكتروني</label>
              <div className="relative group">
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                  <Mail size={18} />
                </div>
                <input
                  className="w-full bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-xl py-3.5 pl-4 pr-12 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600 font-inter"
                  value={lg.username}
                  onChange={(e) => lg.setUsername(e.target.value)}
                  placeholder="email@example.com"
                  dir="ltr"
                  type="email"
                  disabled={lg.loading}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-400 mr-1">كلمة المرور</label>
              <div className="relative group">
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  className="w-full bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-xl py-3.5 pl-12 pr-12 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600 font-inter"
                  value={lg.password}
                  onChange={(e) => lg.setPassword(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                  type={showPassword ? 'text' : 'password'}
                  disabled={lg.loading}
                  autoComplete={lg.isRegister ? 'new-password' : 'current-password'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !lg.isRegister) void lg.login()
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirm Password (Register only) */}
            {lg.isRegister && (
              <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300" style={{ animationDelay: '100ms' }}>
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 mr-1">تأكيد كلمة المرور</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-500 transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    className="w-full bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-xl py-3.5 pl-12 pr-12 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600 font-inter"
                    value={lg.confirmPassword}
                    onChange={(e) => lg.setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    dir="ltr"
                    type={showConfirmPassword ? 'text' : 'password'}
                    disabled={lg.loading}
                    autoComplete="new-password"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void lg.register()
                    }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                className="w-full relative overflow-hidden bg-gradient-to-l from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2.5 focus:ring-4 focus:ring-indigo-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-xl shadow-indigo-600/25 hover:shadow-indigo-500/40 active:scale-[0.98] text-[15px] group"
                type="button"
                disabled={!lg.canLogin || lg.loading}
                onClick={() => void (lg.isRegister ? lg.register() : lg.login())}
              >
                {/* Button shine effect */}
                <div className="absolute inset-0 bg-gradient-to-l from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                
                {lg.loading ? (
                  <RefreshCw className="animate-spin" size={20} />
                ) : lg.isRegister ? (
                  <ArrowRight size={20} className="rotate-180" />
                ) : (
                  <Lock size={18} />
                )}
                <span className="relative">
                  {lg.loading 
                    ? 'جاري التنفيذ...' 
                    : lg.isRegister 
                      ? 'إنشاء الحساب' 
                      : 'تسجيل الدخول'
                  }
                </span>
              </button>
            </div>

            {/* Divider */}
            <div className="relative py-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-gray-50 dark:bg-slate-950 px-4 text-gray-400 dark:text-gray-600 font-medium">
                  {lg.isRegister ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب؟'}
                </span>
              </div>
            </div>

            {/* Toggle Register/Login */}
            <button
              type="button"
              className="w-full py-3.5 px-4 rounded-xl border-2 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 font-bold text-sm hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              onClick={() => lg.setIsRegister(!lg.isRegister)}
              disabled={lg.loading}
            >
              {lg.isRegister ? (
                <>
                  <Lock size={16} />
                  سجّل دخولك
                </>
              ) : (
                <>
                  <User size={16} />
                  أنشئ حساباً جديداً
                </>
              )}
            </button>
          </div>

          {/* Error/Success Message */}
          {lg.error && (
            <div className={`mt-6 p-4 rounded-xl text-sm font-bold border flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300 ${
              lg.error.includes('بنجاح') || lg.error.includes('success')
                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30'
                : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/30'
            }`}>
              {lg.error.includes('بنجاح') || lg.error.includes('success') ? (
                <CheckCircle2 size={18} className="flex-shrink-0" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              )}
              <span>{lg.error}</span>
            </div>
          )}

          {/* Pending approval notice */}
          {lg.error?.includes('المراجعة') && (
            <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400 text-xs font-bold leading-relaxed animate-in fade-in duration-500">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={16} />
                <span className="text-sm">بانتظار الموافقة</span>
              </div>
              تم إرسال طلبك للمدير. ستتلقى إشعاراً عند الموافقة على حسابك. يمكنك المحاولة مرة أخرى لاحقاً.
            </div>
          )}

          {/* Bottom text */}
          <div className="text-center mt-6 mb-6 sm:mt-8 sm:mb-8 lg:mb-0 pb-[env(safe-area-inset-bottom)]">
            <p className="text-[11px] text-gray-400 dark:text-gray-600">
              بتسجيل دخولك، أنت توافق على سياسة الاستخدام والخصوصية
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}