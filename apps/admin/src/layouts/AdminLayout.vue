<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NIcon,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NMenu,
  NSpace,
  NText,
  type MenuOption,
} from 'naive-ui'
import { clearToken, getUsername } from '../utils/auth'

const router = useRouter()
const route = useRoute()
const username = computed(() => getUsername() || 'admin')

const MOBILE_BP = 1024
const SIDER_WIDTH = 232
const isMobile = ref(false)
const mobileOpen = ref(false)
const collapsed = ref(false)

function icon(paths: string[]) {
  return () =>
    h(
      NIcon,
      { size: 18 },
      {
        default: () =>
          h(
            'svg',
            {
              xmlns: 'http://www.w3.org/2000/svg',
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': '1.8',
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            },
            paths.map((d) => h('path', { d })),
          ),
      },
    )
}

const I = {
  grid: icon([
    'M4 4h7v7H4z',
    'M13 4h7v7h-7z',
    'M4 13h7v7H4z',
    'M13 13h7v7h-7z',
  ]),
  list: icon(['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01']),
  wallet: icon(['M3 7h18v12H3z', 'M16 12h5', 'M3 7l2-3h14l2 3']),
  card: icon(['M3 6h18v12H3z', 'M3 10h18']),
  users: icon([
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ]),
  settings: icon([
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  ]),
  menu: icon(['M4 6h16', 'M4 12h16', 'M4 18h16']),
  logout: icon(['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9']),
}

const menuOptions: MenuOption[] = [
  { label: '概览', key: '/dashboard', icon: I.grid },
  { label: '订单', key: '/orders', icon: I.list },
  { label: '支付宝', key: '/channels/alipay', icon: I.wallet },
  { label: '微信支付', key: '/channels/wxpay', icon: I.card },
  { label: '商户', key: '/merchants', icon: I.users },
  { label: '设置', key: '/settings', icon: I.settings },
]

const activeKey = computed(() => {
  if (route.path.startsWith('/orders')) return '/orders'
  if (route.path.startsWith('/channels/wxpay')) return '/channels/wxpay'
  if (route.path.startsWith('/channels/alipay')) return '/channels/alipay'
  if (route.path.startsWith('/channels')) return route.path
  return route.path
})

const pageTitle = computed(() => {
  const hit = menuOptions.find((m) => m.key === activeKey.value)
  return String(hit?.label ?? route.meta?.title ?? '运营控制台')
})

function onMenuUpdate(key: string) {
  router.push(key)
  if (isMobile.value) mobileOpen.value = false
}

function logout() {
  clearToken()
  router.replace('/login')
}

function syncViewport() {
  const mobile = window.innerWidth < MOBILE_BP
  isMobile.value = mobile
  if (!mobile) {
    mobileOpen.value = false
  } else {
    collapsed.value = false
  }
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
})

watch(
  () => route.fullPath,
  () => {
    if (isMobile.value) mobileOpen.value = false
  },
)
</script>

<template>
  <NLayout has-sider class="shell" position="absolute">
    <NLayoutSider
      v-if="!isMobile"
      bordered
      collapse-mode="width"
      :collapsed="collapsed"
      :collapsed-width="64"
      :width="SIDER_WIDTH"
      show-trigger="bar"
      :native-scrollbar="false"
      class="shell-sider"
      @update:collapsed="(v) => (collapsed = v)"
    >
      <div class="brand" :class="{ 'brand--collapsed': collapsed }">
        <div class="brand-mark" aria-hidden="true">H</div>
        <div v-if="!collapsed" class="brand-text">
          <div class="brand-name">花间支付</div>
          <div class="brand-sub">Admin Console</div>
        </div>
      </div>
      <NMenu
        :value="activeKey"
        :options="menuOptions"
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="20"
        :indent="18"
        @update:value="onMenuUpdate"
      />
    </NLayoutSider>

    <NDrawer
      v-model:show="mobileOpen"
      placement="left"
      :width="SIDER_WIDTH"
      :trap-focus="false"
      display-directive="show"
    >
      <NDrawerContent :native-scrollbar="false" body-content-style="padding: 0" title="花间支付">
        <NMenu
          :value="activeKey"
          :options="menuOptions"
          :indent="18"
          @update:value="onMenuUpdate"
        />
      </NDrawerContent>
    </NDrawer>

    <NLayout class="shell-main" :native-scrollbar="false">
      <NLayoutHeader bordered class="shell-header">
        <div class="header-left">
          <NButton
            v-if="isMobile"
            quaternary
            circle
            aria-label="打开导航"
            @click="mobileOpen = true"
          >
            <template #icon>
              <NIcon :size="20">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </NIcon>
            </template>
          </NButton>
          <div class="header-titles">
            <NText strong class="header-title">{{ pageTitle }}</NText>
            <NText depth="3" class="header-hint">运营控制台</NText>
          </div>
        </div>
        <NSpace align="center" :size="12">
          <NText depth="3" class="header-user">{{ username }}</NText>
          <NButton quaternary type="primary" @click="logout">
            <template #icon>
              <NIcon :size="18">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
              </NIcon>
            </template>
            退出
          </NButton>
        </NSpace>
      </NLayoutHeader>

      <NLayoutContent
        class="shell-content"
        :content-style="{
          padding: isMobile ? '16px' : '24px',
          minHeight: 'calc(100vh - var(--hj-header-h))',
        }"
      >
        <div class="page">
          <router-view />
        </div>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

<style scoped>
.shell {
  inset: 0;
  min-height: 100vh;
  height: 100vh;
  background: var(--hj-bg-app);
}

.shell-sider {
  background: var(--hj-bg-surface) !important;
  border-right: 1px solid var(--hj-border);
  flex: 0 0 auto !important;
  max-width: 232px;
}

.shell-main {
  flex: 1 1 auto;
  min-width: 0;
  background: var(--hj-bg-app);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 16px 14px;
  border-bottom: 1px solid var(--hj-border);
  margin-bottom: 8px;
  min-height: 64px;
}

.brand--collapsed {
  justify-content: center;
  padding-left: 8px;
  padding-right: 8px;
}

.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 15px;
  color: #fff;
  background: linear-gradient(145deg, var(--hj-primary) 0%, #1e3a8a 100%);
  box-shadow: 0 4px 12px rgb(29 78 216 / 25%);
  flex-shrink: 0;
}

.brand-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--hj-text);
  line-height: 1.2;
}

.brand-sub {
  font-size: 11px;
  color: var(--hj-text-muted);
  margin-top: 2px;
}

.shell-header {
  height: var(--hj-header-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 0 20px;
  background: var(--hj-bg-surface) !important;
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.header-titles {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.header-title {
  font-size: 15px;
  white-space: nowrap;
}

.header-hint {
  font-size: 12px;
  white-space: nowrap;
}

.header-user {
  font-size: 13px;
}

.shell-content {
  background: var(--hj-bg-app);
  min-width: 0;
}

.page {
  width: 100%;
  max-width: none;
  min-width: 0;
}

@media (max-width: 1023px) {
  .header-hint {
    display: none;
  }
}

@media (max-width: 480px) {
  .header-user {
    display: none;
  }
}
</style>
