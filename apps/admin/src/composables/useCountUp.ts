import { onUnmounted, ref, watch, type Ref } from 'vue'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export type CountUpOptions = {
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
}

/**
 * Smooth count-up for numeric KPI values.
 * Supports integers, decimals, and optional prefix/suffix (e.g. ¥ / %).
 * Honors prefers-reduced-motion (jump to final value).
 */
export function useCountUp(target: Ref<number>, options?: CountUpOptions | (() => CountUpOptions)) {
  const display = ref('0')
  let raf = 0
  let startTs = 0
  let from = 0
  let to = target.value

  function opts(): Required<CountUpOptions> {
    const o = typeof options === 'function' ? options() : options || {}
    return {
      duration: o.duration ?? 700,
      decimals: o.decimals ?? 0,
      prefix: o.prefix ?? '',
      suffix: o.suffix ?? '',
    }
  }

  function format(n: number): string {
    const { decimals, prefix, suffix } = opts()
    if (decimals === 0) {
      const abs = Math.abs(Math.round(n))
      const grouped = abs.toLocaleString('en-US')
      const sign = n < 0 ? '-' : ''
      return `${prefix}${sign}${grouped}${suffix}`
    }
    return `${prefix}${n.toFixed(decimals)}${suffix}`
  }

  function stop() {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  function animateTo(next: number) {
    stop()
    to = next
    const { duration } = opts()
    if (prefersReducedMotion() || duration <= 0) {
      from = next
      display.value = format(next)
      return
    }
    const { prefix, suffix } = opts()
    from = parseFloat(
      display.value
        .replace(prefix, '')
        .replace(suffix, '')
        .replace(/,/g, ''),
    )
    if (!Number.isFinite(from)) from = 0
    startTs = 0

    const step = (ts: number) => {
      if (!startTs) startTs = ts
      const p = Math.min(1, (ts - startTs) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const cur = from + (to - from) * eased
      display.value = format(cur)
      if (p < 1) {
        raf = requestAnimationFrame(step)
      } else {
        display.value = format(to)
        raf = 0
      }
    }
    raf = requestAnimationFrame(step)
  }

  watch(
    target,
    (v) => {
      animateTo(Number.isFinite(v) ? v : 0)
    },
    { immediate: true },
  )

  onUnmounted(stop)

  return { display, stop }
}
