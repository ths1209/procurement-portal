const TEABLE_URL = 'https://yach-teable.zhiyinlou.com/base/bsezwCnyl2rAB8R4wFT/table/tbl4e5Cuu6nlNw19uqz/viw4NKBSKkxIo1kOrlK'

export default function CostLedger() {
  return (
    <div className="-m-5 lg:-m-7 h-[calc(100vh-2.5rem)] lg:h-screen flex flex-col">
      <iframe
        src={TEABLE_URL}
        title="成本台账"
        className="flex-1 w-full border-0"
        style={{ background: 'var(--bg)' }}
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </div>
  )
}
