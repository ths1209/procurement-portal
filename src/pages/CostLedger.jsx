import { useState, useMemo } from 'react'
import { Wallet, ExternalLink, AlertCircle, Loader2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

const DEFAULT_URL = 'https://yach-teable.zhiyinlou.com/share/shrlzdx0BtJxMDu0294/view'
const SHARE_PASSWORD = '1209'
const RAW_URL = import.meta.env.VITE_TEABLE_COST_LEDGER_URL || DEFAULT_URL

export default function CostLedger() {
  const { dark } = useTheme()
  const [loading, setLoading] = useState(!!RAW_URL)

  // 把主题 / 密码作为 query 传给 Teable 分享页（不支持的参数会被忽略）
  const embedUrl = useMemo(() => {
    if (!RAW_URL) return ''
    try {
      const u = new URL(RAW_URL)
      u.searchParams.set('theme', dark ? 'dark' : 'light')
      if (SHARE_PASSWORD) u.searchParams.set('password', SHARE_PASSWORD)
      return u.toString()
    } catch {
      return RAW_URL
    }
  }, [dark])

  if (!RAW_URL) {
    return (
      <div className="-m-5 lg:-m-7 h-[calc(100vh-2.5rem)] lg:h-screen flex items-center justify-center px-6"
        style={{ background: 'var(--bg)' }}>
        <div className="max-w-md w-full rounded-2xl p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5 mb-3">
            <AlertCircle className="w-5 h-5" style={{ color: '#F59E0B' }} />
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>未配置嵌入地址</h2>
          </div>
          <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
            请在 <code className="px-1.5 py-0.5 rounded text-[11.5px]"
              style={{ background: 'var(--surface2)', color: 'var(--text)' }}>.env.local</code> 中配置 <code>VITE_TEABLE_COST_LEDGER_URL</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="-m-5 lg:-m-7 h-[calc(100vh-2.5rem)] lg:h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* 极简顶栏 */}
      <header className="px-6 py-3 flex items-center gap-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
          <Wallet className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-bold leading-tight" style={{ color: 'var(--text)' }}>成本台账</h1>
          <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
            内嵌自 Teable 分享视图 · 仅管理员可见
          </p>
        </div>
        <a href={embedUrl} target="_blank" rel="noopener noreferrer"
          className="press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
          title="在新标签页打开">
          <ExternalLink className="w-3.5 h-3.5" />新标签页打开
        </a>
      </header>

      {/* iframe 填充 —— key 触发主题切换时重新加载 */}
      <div className="flex-1 relative" style={{ background: 'var(--bg)' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
            style={{ background: 'var(--bg)' }}>
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
        )}
        <iframe
          key={dark ? 'dark' : 'light'}
          src={embedUrl}
          title="成本台账"
          onLoad={() => setLoading(false)}
          className="w-full h-full"
          style={{ border: 0, background: dark ? '#0f172a' : '#ffffff', colorScheme: dark ? 'dark' : 'light' }}
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  )
}
