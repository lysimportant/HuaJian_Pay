export function money(v: unknown): string {
  const n = Number(v || 0)
  if (!Number.isFinite(n)) return '¥0.00'
  return `¥${n.toFixed(2)}`
}

/** Amount from integer cents */
export function moneyFromCents(cents: unknown): string {
  const n = Number(cents || 0)
  if (!Number.isFinite(n)) return '¥0.00'
  return money(n / 100)
}

export function formatTime(v: unknown): string {
  if (v == null || v === '') return '-'
  const n = Number(v)
  const d =
    Number.isFinite(n) && String(Math.trunc(n)).length >= 10
      ? new Date(n < 1e12 ? n * 1000 : n)
      : new Date(String(v))
  if (Number.isNaN(d.getTime())) return String(v)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function statusLabel(status: unknown): string {
  const key = String(status ?? '')
  const map: Record<string, string> = {
    pending: '待支付',
    paying: '支付中',
    paid: '已支付',
    success: '已支付',
    closed: '已关闭',
    failed: '失败',
    expired: '已过期',
    none: '未通知',
    notify_pending: '通知中',
    notify_success: '通知成功',
    notify_failed: '通知失败',
    PENDING: '待支付',
    PAID: '已支付',
    SUCCESS: '已支付',
    CLOSED: '已关闭',
    FAILED: '失败',
    EXPIRED: '已过期',
  }
  return map[key] || key || '-'
}

export function statusType(
  status: unknown,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  const s = String(status || '').toLowerCase()
  if (s === 'paid' || s === 'success' || s === 'notify_success') return 'success'
  if (s === 'pending' || s === 'paying' || s === 'notify_pending') return 'warning'
  if (s === 'failed' || s === 'notify_failed') return 'error'
  if (s === 'closed' || s === 'expired' || s === 'none') return 'default'
  return 'info'
}

export { pickMsg } from '../api/client'
