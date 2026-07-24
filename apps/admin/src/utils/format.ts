export function money(v: unknown): string {
  const n = Number(v || 0)
  // backend money fields are yuan strings/numbers
  if (String(v).includes('.') || n < 1000 && n !== Math.floor(n)) {
    return `¥${n.toFixed(2)}`
  }
  // fallback treat large integers without decimal as cents only when clearly cents-like API
  return `¥${n.toFixed(2)}`
}

export function formatTime(v: unknown): string {
  if (v == null || v === '') return '-'
  const n = Number(v)
  const d = Number.isFinite(n) && String(Math.trunc(n)).length >= 10 ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(v))
  if (Number.isNaN(d.getTime())) return String(v)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '待支付',
    paid: '已支付',
    closed: '已关闭',
    failed: '失败',
    PENDING: '待支付',
    PAID: '已支付',
    CLOSED: '已关闭',
  }
  return map[status] || status || '-'
}

export function statusType(status: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  const s = String(status || '').toLowerCase()
  if (s === 'paid' || s === 'success') return 'success'
  if (s === 'pending') return 'warning'
  if (s === 'failed') return 'error'
  if (s === 'closed') return 'default'
  return 'info'
}
