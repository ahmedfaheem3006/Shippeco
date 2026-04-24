import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from './useAuthStore'
import { api } from '../utils/apiClient'

export function useLoginPage() {
  const nav = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const canLogin = useMemo(() => {
    if (isRegister) return Boolean(username.trim() && password && confirmPassword && name.trim())
    return Boolean(username.trim() && password)
  }, [isRegister, name, password, confirmPassword, username])

  const login = useCallback(async () => {
    setError(null)
    const u = username.trim()
    if (!u || !password) {
      setError('أدخل البريد الإلكتروني وكلمة المرور')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/auth/login', {
        email: u,
        password: password
      })

      // إذا فشل تسجيل الدخول (مثلاً 401) الـ apiClient بيرجع الـ JSON اللي فيه الخطأ
      if (response && response.error) {
        throw new Error(response.error.message || response.message || 'فشل تسجيل الدخول')
      }

      if (!response || !response.user) {
        throw new Error('بيانات غير صحيحة من السيرفر')
      }

      const { user, token } = response
      setUser({ username: user.email, name: user.full_name || user.name, role: user.role, status: user.status }, token)
      
      if (user.status !== 'approved') {
         setError('حسابك قيد المراجعة أو معطل، يرجى التواصل مع الإدارة')
         return 
      }

      nav('/dashboard', { replace: true })
    } catch (e: any) {
      setError(e.message || 'فشل تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }, [nav, password, setUser, username])

  const register = useCallback(async () => {
    setError(null)
    const u = username.trim()
    if (!u || !password || !confirmPassword || !name) {
      setError('أدخل جميع البيانات المطلوبة')
      return
    }

    if (password !== confirmPassword) {
      setError('كلمتي المرور غير متطابقتين')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/auth/register', {
        email: u,
        password: password,
        confirmPassword: confirmPassword,
        full_name: name,
        phone: phone
      })

      if (response && response.error) {
        throw new Error(response.error.message || response.message || 'فشل التسجيل')
      }

      setError('تم التسجيل بنجاح! بانتظار موافقة الإدارة.')
      setIsRegister(false)
      setPassword('')
      setConfirmPassword('')
    } catch (e: any) {
      setError(e.message || 'فشل التسجيل')
    } finally {
      setLoading(false)
    }
  }, [name, password, confirmPassword, phone, username])

  return {
    loading,
    error,
    username,
    setUsername,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    name,
    setName,
    phone,
    setPhone,
    isRegister,
    setIsRegister,
    canLogin,
    login,
    register,
  }
}
