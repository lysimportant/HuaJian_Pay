import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ThemeMode } from '../utils/theme'
import {
  applyDocumentTheme,
  getStoredThemeMode,
  resolveIsDark,
  setStoredThemeMode,
} from '../utils/theme'

const mode = ref<ThemeMode>(getStoredThemeMode())
const isDark = ref(resolveIsDark(mode.value))

let media: MediaQueryList | null = null
let mediaHandler: (() => void) | null = null
let watchersReady = false

function syncFromMode() {
  const dark = resolveIsDark(mode.value)
  applyDocumentTheme(dark)
  isDark.value = dark
}

function ensureWatchers() {
  if (watchersReady) return
  watchersReady = true

  watch(
    mode,
    (m) => {
      setStoredThemeMode(m)
      syncFromMode()
    },
    { immediate: true },
  )

  if (typeof window !== 'undefined') {
    media = window.matchMedia('(prefers-color-scheme: dark)')
    mediaHandler = () => {
      if (mode.value === 'system') syncFromMode()
    }
    media.addEventListener('change', mediaHandler)
  }
}

export function useTheme() {
  onMounted(() => {
    ensureWatchers()
    mode.value = getStoredThemeMode()
    syncFromMode()
  })

  onUnmounted(() => {
    // keep global media listener for other consumers
  })

  ensureWatchers()

  function setMode(next: ThemeMode) {
    if (mode.value === next) {
      syncFromMode()
      return
    }
    mode.value = next
  }

  /** Single-click light <-> dark (from system uses currently resolved appearance). */
  function toggleLightDark() {
    const currentlyDark = resolveIsDark(mode.value)
    setMode(currentlyDark ? 'light' : 'dark')
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
    toggleLightDark,
    cycleMode,
  }
}
