<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { MenuOption } from 'naive-ui'
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NButton,
  NIcon,
  NSpace,
  NText,
  NDropdown,
  NTooltip,
  NAvatar,
  useMessage,
} from 'naive-ui'
import {
  HomeOutline,
  ReceiptOutline,
  LogoAlipay,
  LogoWechat,
  PeopleOutline,
  SettingsOutline,
  PersonCircleOutline,
  MenuOutline,
  SunnyOutline,
  MoonOutline,
  DesktopOutline,
  LogOutOutline,
  ChevronDownOutline,
} from '@vicons/ionicons5'
import { fetchMe, roleLabel, type MeUser } from '../api/admin'
import { clearAuth, getUsername } from '../utils/auth'
import { useTheme } from '../composables/useTheme'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const collapsed = ref(false)
const mobileOpen = ref(false)
const isNarrow = ref(false)
const me = ref<MeUser | null>(null)
const { mode, isDark, setMode, toggleLightDark } = useTheme()

/** viewer 隐藏写通道/商户；账号管理仅在 Profile 内 gate */
const canWriteConfig = computed(() => me.value?.role !== 'viewer')

function icon(comp: unknown) {
  return () => h(NIcon, null, { default: () => h(comp as object) })
}

const menuOptions = computed<MenuOption[]>(() => {
  const items: MenuOption[] = [
    { label: '仪表盘', key: '/dashboard', icon: icon(HomeOutline) },
    { label: '订单中心', key: '/orders', icon: icon(ReceiptOutline) },
  ]
  if (canWriteConfig.value) {
    items.push(
      { label: '支付宝通道', key: '/channels/alipay', icon: icon(LogoAlipay) },
      { label: '微信通道', key: '/channels/wxpay', icon: icon(LogoWechat) },
      { label: '商户管理', key: '/merchants', icon: icon(PeopleOutline) },
    )
  }
  items.push({ label: '系统设置', key: '/settings', icon: icon(SettingsOutline) })
  // 侧栏不出现「个人信息」——仅顶栏账号菜单
  return items
})

const activeKey = computed(() => {
  const p = route.path
  if (p.startsWith('/orders')) return '/orders'
  if (p.startsWith('/channels/alipay')) return '/channels/alipay'
  if (p.startsWith('/channels/wxpay')) return '/channels/wxpay'
  if (p.startsWith('/merchants')) return '/merchants'
  if (p.startsWith('/settings')) return '/settings'
  if (p.startsWith('/profile')) return '/profile'
  return '/dashboard'
})

const displayName = computed(() => {
  const d = me.value?.display_name?.trim()
  if (d) return d
  return me.value?.username || getUsername() || '管理员'
})

const avatarLetter = computed(() => {
  const n = displayName.value
  return n ? n.slice(0, 1).toUpperCase() : 'A'
})

const themeIcon = computed(() => {
  if (mode.value === 'system') return DesktopOutline
  return isDark.value ? MoonOutline : SunnyOutline
})

const themeToggleLabel = computed(() => {
  if (mode.value === 'system') {
    return isDark.value ? '深色（系统）' : '浅色（系统）'
  }
  return isDark.value ? '深色' : '浅色'
})

const themeTip = computed(() => {
  if (mode.value === 'system') return '当前跟随系统；单击切换为亮/暗'
  return isDark.value ? '单击切换为浅色' : '单击切换为深色'
})

const accountOptions = computed(() => [
  { label: displayName.value, key: 'header', disabled: true },
  { label: `角色：${roleLabel(me.value?.role)}`, key: 'role', disabled: true },
  { type: 'divider' as const, key: 'd1' },
  { label: '个人信息', key: 'profile', icon: icon(PersonCircleOutline) },
  { label: '退出登录', key: 'logout', icon: icon(LogOutOutline) },
])

const themeMenuOptions = [
  { label: '浅色', key: 'light', icon: icon(SunnyOutline) },
  { label: '深色', key: 'dark', icon: icon(MoonOutline) },
  { label: '跟随系统', key: 'system', icon: icon(DesktopOutline) },
]

function onMenuUpdate(key: string) {
  router.push(key)
  mobileOpen.value = false
}

function onAccountSelect(key: string) {
  if (key === 'profile') router.push('/profile')
  if (key === 'logout') {
    clearAuth()
    message.success('已退出登录')
    router.replace('/login')
  }
}

function onThemeMenuSelect(key: string) {
  if (key === 'light' || key === 'dark' || key === 'system') setMode(key)
}

/** Primary visible control: one-shot light/dark — no NTooltip wrapper race */
function onThemeClick() {
  toggleLightDark()
}

function updateNarrow() {
  isNarrow.value = window.innerWidth < 768
  if (!isNarrow.value) mobileOpen.value = false
}

async function loadMe() {
  try {
    const res = await fetchMe()
    if (res?.code === 0 && res.user) me.value = res.user
  } catch {
    // layout still usable with local username
  }
}

onMounted(() => {
  updateNarrow()
  window.addEventListener('resize', updateNarrow)
  void loadMe()
})
onUnmounted(() => window.removeEventListener('resize', updateNarrow))

watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
  },
)
</script>

<template>
  <div class="shell" :class="{ 'shell-narrow': isNarrow }">
    <div v-if="isNarrow && mobileOpen" class="shell-mask" @click="mobileOpen = false" />

    <NLayout has-sider position="absolute" class="shell-layout">
      <NLayoutSider
        v-show="!isNarrow || mobileOpen"
        bordered
        collapse-mode="width"
        :collapsed-width="isNarrow ? 0 : 72"
        :width="isNarrow ? 240 : 232"
        :collapsed="isNarrow ? false : collapsed"
        :show-trigger="isNarrow ? false : 'bar'"
        :native-scrollbar="false"
        class="shell-sider"
        :class="{ 'shell-sider-drawer': isNarrow }"
        @collapse="collapsed = true"
        @expand="collapsed = false"
      >
        <div class="brand" :class="{ 'brand-collapsed': !isNarrow && collapsed }">
          <div class="brand-mark">H</div>
          <div v-if="isNarrow || !collapsed" class="brand-text">
            <strong>花间支付</strong>
            <span>运营控制台</span>
          </div>
        </div>
        <NMenu
          :value="activeKey"
          :collapsed="!isNarrow && collapsed"
          :collapsed-width="72"
          :collapsed-icon-size="20"
          :options="menuOptions"
          @update:value="onMenuUpdate"
        />
      </NLayoutSider>

      <NLayout class="shell-main">
        <NLayoutHeader bordered class="shell-header">
          <div class="header-left">
            <NButton
              v-if="isNarrow"
              quaternary
              circle
              aria-label="打开菜单"
              @click="mobileOpen = !mobileOpen"
            >
              <template #icon>
                <NIcon :component="MenuOutline" />
              </template>
            </NButton>
            <div>
              <NText strong>{{ route.meta.title || '控制台' }}</NText>
              <NText depth="3" class="header-sub">HuaJian Pay Admin</NText>
            </div>
          </div>
          <NSpace align="center" :size="8">
            <!-- 显式可见主题切换：主按钮单击 light↔dark；旁侧次级菜单含 system -->
            <div class="theme-control" role="group" aria-label="主题切换">
              <NButton
                secondary
                size="small"
                class="theme-toggle-btn"
                :aria-label="themeTip"
                :title="themeTip"
                @click="onThemeClick"
              >
                <template #icon>
                  <NIcon :component="themeIcon" />
                </template>
                {{ themeToggleLabel }}
              </NButton>
              <NDropdown
                trigger="click"
                :options="themeMenuOptions"
                @select="onThemeMenuSelect"
              >
                <NButton
                  secondary
                  size="small"
                  class="theme-menu-btn"
                  aria-label="更多主题选项"
                  title="浅色 / 深色 / 跟随系统"
                >
                  <template #icon>
                    <NIcon :component="ChevronDownOutline" />
                  </template>
                </NButton>
              </NDropdown>
            </div>

            <NDropdown
              trigger="click"
              :options="accountOptions"
              @select="onAccountSelect"
            >
              <button type="button" class="account-trigger" aria-label="账号菜单">
                <NAvatar round size="small">{{ avatarLetter }}</NAvatar>
                <span class="account-name">{{ displayName }}</span>
              </button>
            </NDropdown>
          </NSpace>
        </NLayoutHeader>

        <NLayoutContent class="shell-content" :native-scrollbar="true">
          <div class="page-wrap">
            <router-view v-slot="{ Component }">
              <transition name="page-fade" mode="out-in">
                <component :is="Component" />
              </transition>
            </router-view>
          </div>
        </NLayoutContent>
      </NLayout>
    </NLayout>
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  height: 100dvh;
  min-height: 100vh;
  overflow: hidden;
  background: var(--hj-bg-app);
}
.shell-layout {
  height: 100%;
  background: transparent;
}
.shell-sider {
  height: 100%;
  background: var(--hj-bg-surface);
}
.shell-sider :deep(.n-layout-sider-scroll-container) {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.shell-sider-drawer {
  position: fixed !important;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 40;
  height: 100dvh !important;
  box-shadow: var(--hj-shadow-elevated);
}
.shell-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 30;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 16px 12px;
  min-height: 72px;
  flex-shrink: 0;
}
.brand-collapsed {
  justify-content: center;
  padding-inline: 12px;
}
.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  flex-shrink: 0;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.brand-text strong {
  font-size: 15px;
  color: var(--hj-text);
}
.brand-text span {
  font-size: 12px;
  color: var(--hj-text-secondary);
}
.shell-main {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.shell-header {
  height: 64px;
  flex-shrink: 0;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: color-mix(in srgb, var(--hj-bg-surface) 92%, transparent);
  backdrop-filter: blur(10px);
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.header-sub {
  display: block;
  font-size: 12px;
}
.theme-control {
  display: inline-flex;
  align-items: stretch;
  border-radius: 8px;
  overflow: hidden;
}
.theme-toggle-btn {
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
}
.theme-menu-btn {
  border-top-left-radius: 0 !important;
  border-bottom-left-radius: 0 !important;
  border-left: 0 !important;
  padding-inline: 6px !important;
  min-width: 28px;
}
.account-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 999px;
  color: var(--hj-text);
}
.account-trigger:hover {
  background: var(--hj-primary-soft);
}
.account-name {
  font-size: 13px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 480px) {
  .account-name {
    display: none;
  }
  .theme-toggle-btn :deep(.n-button__content) {
    /* 极窄屏只显示图标，仍保留显式按钮 */
  }
}
.shell-content {
  flex: 1;
  min-height: 0;
  background: transparent;
}
.page-wrap {
  /* 主区全宽：不得 max-width 压窄 */
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 20px;
  box-sizing: border-box;
}
@media (max-width: 767px) {
  .page-wrap {
    padding: 14px;
  }
  .shell-header {
    padding: 0 12px;
  }
}
</style>
