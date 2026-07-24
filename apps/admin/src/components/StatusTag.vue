<script setup lang="ts">
import { computed } from 'vue'
import { statusLabel, statusType } from '../utils/format'

const props = withDefaults(
  defineProps<{
    status?: string | number | null
    label?: string
    type?: 'default' | 'info' | 'success' | 'warning' | 'error'
    showDot?: boolean
  }>(),
  { showDot: true },
)

const resolvedType = computed(() => props.type || statusType(props.status))
const resolvedLabel = computed(() => props.label || statusLabel(props.status))
</script>

<template>
  <span class="status-pill" :class="`status-pill--${resolvedType}`">
    <span v-if="showDot" class="status-pill__dot" aria-hidden="true" />
    <span>{{ resolvedLabel }}</span>
  </span>
</template>
