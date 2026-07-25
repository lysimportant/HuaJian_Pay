<script setup lang="ts">
import { NCard, NText } from 'naive-ui'

withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  }>(),
  { tone: 'default' },
)
</script>

<template>
  <NCard class="kpi-card" :class="`kpi-card--${tone}`" :bordered="true" size="medium" hoverable>
    <div class="kpi-inner">
      <div class="kpi-label">
        <NText depth="3">{{ label }}</NText>
      </div>
      <div class="kpi-value">{{ value }}</div>
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
