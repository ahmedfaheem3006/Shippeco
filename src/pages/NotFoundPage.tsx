import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>الصفحة غير موجودة</h2>
      <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 13 }}>
        <Link to="/dashboard" style={{ color: '#0ea5e9' }}>
          العودة إلى لوحة التحكم
        </Link>
      </div>
    </div>
  )
}
