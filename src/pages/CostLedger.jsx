import { useState } from 'react'
import { Wallet, ExternalLink, AlertCircle, Loader2 } from 'lucide-react'

const DEFAULT_URL = 'https://yach-teable.zhiyinlou.com/share/shrIyjkFfhOzl4WJLoV/view'
const EMBED_URL = import.meta.env.VITE_TEABLE_COST_LEDGER_URL || DEFAULT_URL

export default function CostLedger() {
  const [loading, setLoading] = useState(!!EMBED_URL)

  if (!EMBED_URL) {
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
              style={{ background: 'var(--surface2)', color: 'var(--text)' }}>.env.local</code> 中配置：
          </p>
          <pre className="mt-3 px-3 py-2.5 rounded-lg text-[11.5px] overflow-x-auto"
            style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
VITE_TEABLE_COST_LEDGER_URL=https://yach-teable.zhiyinlou.com/space/.../base/.../tbl4e5Cuu6nlNw19uqz?viewId=...
          </pre>
          <p className="text-[11.5px] leading-relaxed mt-3" style={{ color: 'var(--muted)' }}>
            在 Teable 打开成本台账视图后，直接复制浏览器地址栏的 URL 即可。配置后重新构建。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="-m-5 lg:-m-7 h-[calc(100vh-2.5rem)] lg:h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* 极简顶栏 */}
      <header className="px-6 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)' }}>
          <Wallet className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-bold leading-tight" style={{ color: 'var(--text)' }}>成本台账</h1>
          <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
            内嵌自 Teable · 需在 Teable 实例保持登录
          </p>
        </div>
        <a href={EMBED_URL} target="_blank" rel="noopener noreferrer"
          className="press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-colors"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
          title="在新标签页打开">
          <ExternalLink className="w-3.5 h-3.5" />新标签页打开
        </a>
      </header>

      {/* iframe 填充 */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
            style={{ background: 'var(--bg)' }}>
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
        )}
        <iframe
          src={EMBED_URL}
          title="成本台账"
          onLoad={() => setLoading(false)}
          className="w-full h-full"
          style={{ border: 0, background: 'var(--bg)' }}
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  )
}
