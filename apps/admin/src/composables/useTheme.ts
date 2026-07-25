import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  applyDocumentTheme,
  getStoredThemeMode,
  resolveIsDark,
  setStoredThemeMode,
  type ThemeMode,
} from '../utils/theme'

const mode = ref<ThemeMode>(getStoredThemeMode())
const isDark = ref(resolveIsDark(mode.value))

let media: MediaQueryList | null = null
let bound = false

function syncFromMode() {
  isDark.value = resolveIsDark(mode.value)
  applyDocumentTheme(isDark.value)
}

function onMediaChange() {
  if (mode.value === 'system') syncFromMode()
}

export function useTheme() {
  onMounted(() => {
    if (!bound && typeof window !== 'undefined' && window.matchMedia) {
      media = window.matchMedia('(prefers-color-scheme: dark)')
      media.addEventListener?.('change', onMediaChange)
      bound = true
    }
    syncFromMode()
  })

  onBeforeUnmount(() => {
    // keep global listener for app lifetime; no-op
  })

  watch(mode, (m) => {
    setStoredThemeMode(m)
    syncFromMode()
  })

  function setMode(next: ThemeMode) {
    mode.value = next
  }

  function cycleMode() {
    const order: ThemeMode[] = ['light', 'dark', 'system']
    const i = order.indexOf(mode.value)
    setMode(order[(i + 1) % order.length])
  }

  const modeLabel = computed(() => {
    if (mode.value === 'light') return '浅色'
    if (mode.value === 'dark') return '深色'
    return '跟随系统'
  })

  return {
    mode,
    isDark,
    modeLabel,
    setMode,
    cycleMode,
  }
}

// Apply once on module load for first paint
if (typeof document !== 'undefined') {
  applyDocumentTheme(resolveIsDark(getStoredThemeMode()))
}
