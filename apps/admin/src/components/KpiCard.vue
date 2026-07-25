<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NCard, NText } from 'naive-ui'
import { useCountUp } from '../composables/useCountUp'

const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'
    /** Force count-up decimals; auto-detected from value when omitted */
    decimals?: number
  }>(),
  { tone: 'default' },
)

/** Parse display strings like "¥1,234.56" / "12.5%" / "128" into numeric + affix */
function parseValue(raw: string | number): {
  num: number
  prefix: string
  suffix: string
  decimals: number
} {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const decimals =
      props.decimals ?? (Number.isInteger(raw) ? 0 : String(raw).split('.')[1]?.length || 0)
    return { num: raw, prefix: '', suffix: '', decimals }
  }
  const s = String(raw ?? '').trim()
  if (!s || s === '—' || s === '-') {
    return { num: 0, prefix: '', suffix: '', decimals: 0 }
  }
  const m = s.match(/^([^0-9\-+]*)([-+]?\d[\d,]*(?:\.\d+)?)(.*)$/)
  if (!m) {
    return { num: 0, prefix: '', suffix: s, decimals: 0 }
  }
  const prefix = m[1] || ''
  const numStr = (m[2] || '0').replace(/,/g, '')
  const suffix = m[3] || ''
  const num = Number(numStr)
  const autoDec = numStr.includes('.') ? (numStr.split('.')[1]?.length ?? 0) : 0
  const decimals = props.decimals ?? autoDec
  return {
    num: Number.isFinite(num) ? num : 0,
    prefix,
    suffix,
    decimals,
  }
}

const parsed = computed(() => parseValue(props.value))
const numTarget = ref(parsed.value.num)
const prefix = ref(parsed.value.prefix)
const suffix = ref(parsed.value.suffix)
const decimals = ref(parsed.value.decimals)

watch(
  parsed,
  (p) => {
    prefix.value = p.prefix
    suffix.value = p.suffix
    decimals.value = p.decimals
    numTarget.value = p.num
  },
  { immediate: true },
)

const { display } = useCountUp(numTarget, () => ({
  duration: 700,
  decimals: decimals.value,
  prefix: prefix.value,
  suffix: suffix.value,
}))

// Fallback for non-numeric labels (should be rare)
const shown = computed(() => {
  const s = String(props.value ?? '').trim()
  if (s && !/^[^0-9\-+]*[-+]?\d/.test(s) && typeof props.value === 'string') {
    return s
  }
  return display.value
})
</script>

<template>
  <NCard class="kpi-card" :class="`kpi-card--${tone}`" :bordered="true" size="medium" hoverable>
    <div class="kpi-inner">
      <div class="kpi-label">
        <NText depth="3">{{ label }}</NText>
      </div>
      <div class="kpi-value">{{ shown }}</div>
      <div v-if="hint" class="kpi-hint">
        <NText depth="3">{{ hint }}</NText>
      </div>
      <div v-else class="kpi-hint kpi-hint--spacer" aria-hidden="true">&nbsp;</div>
    </div>
  </NCard>
</template>

<style scoped>
.kpi-card {
  height: 100%;
  min-height: 132px;
  border-radius: var(--hj-radius-lg, 12px) !important;
  box-shadow: var(--hj-shadow-sm);
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
}

.kpi-card:hover {
  box-shadow: var(--hj-shadow-md);
}

.kpi-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 92px;
}

.kpi-label {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.kpi-value {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  color: var(--hj-text);
  word-break: break-all;
}

.kpi-hint {
  font-size: 12px;
  line-height: 1.4;
  min-height: 1.4em;
}

.kpi-hint--spacer {
  visibility: hidden;
}

.kpi-card--success .kpi-value {
  color: var(--hj-success);
}
.kpi-card--warning .kpi-value {
  color: var(--hj-warning);
}
.kpi-card--danger .kpi-value {
  color: var(--hj-danger);
}
.kpi-card--info .kpi-value {
  color: var(--hj-info);
}

@media (prefers-reduced-motion: reduce) {
  .kpi-card {
    transition: none;
  }
}
</style>
