<script setup lang="ts">
import { h, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NButton,
  NSpace,
  NText,
  type MenuOption,
} from 'naive-ui'
import { clearToken, getUsername } from '../utils/auth'

const router = useRouter()
const route = useRoute()
const username = computed(() => getUsername() || 'admin')

const menuOptions: MenuOption[] = [
  { label: '概览', key: '/dashboard' },
  { label: '订单', key: '/orders' },
  { label: '支付宝', key: '/alipay' },
  { label: '商户', key: '/merchants' },
  { label: '设置', key: '/settings' },
]

const activeKey = computed(() => {
  if (route.path.startsWith('/orders')) return '/orders'
  return route.path
})

function onMenuUpdate(key: string) {
  router.push(key)
}

function logout() {
  clearToken()
  router.replace('/login')
}

function renderLabel(option: MenuOption) {
  return h('span', { class: 'nav-label' }, String(option.label ?? ''))
}
</script>

<template>
  <NLayout has-sider class="shell">
    <NLayoutSider
      bordered
      collapse-mode="width"
      :collapsed-width="0"
      :width="240"
      show-trigger="bar"
      content-style="display:flex;flex-direction:column;height:100%"
      class="shell-sider"
    >
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">H</div>
        <div class="brand-text">
          <div class="brand-name">花间支付</div>
          <div class="brand-sub">HuaJian Admin</div>
        </div>
      </div>
      <NMenu
        :value="activeKey"
        :options="menuOptions"
        :render-label="renderLabel"
        @update:value="onMenuUpdate"
      />
      <div class="sider-foot">
        <div class="sider-user">
          <span class="sider-user-dot" aria-hidden="true" />
          <NText depth="3" style="font-size: 12px">{{ username }}</NText>
        </div>
      </div>
    </NLayoutSider>

    <NLayout class="shell-main">
      <NLayoutHeader bordered class="shell-header">
        <div class="header-left">
          <NText strong class="header-title">运营控制台</NText>
          <NText depth="3" class="header-hint">Alipay MVP</NText>
        </div>
        <NSpace align="center">
          <NText depth="3">{{ username }}</NText>
          <NButton quaternary type="primary" @click="logout">退出</NButton>
        </NSpace>
      </NLayoutHeader>
      <NLayoutContent class="shell-content" content-style="padding: 24px;">
        <div class="page">
          <router-view />
        </div>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  background: var(--hj-bg-app);
}

.shell-sider {
  background: var(--hj-bg-surface) !important;
  border-right: 1px solid var(--hj-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px 16px;
  border-bottom: 1px solid var(--hj-border);
  margin-bottom: 8px;
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

.sider-foot {
  margin-top: auto;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--hj-border);
}

.sider-user {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sider-user-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--hj-success);
}

.shell-header {
  height: var(--hj-header-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--hj-bg-surface) !important;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.header-title {
  font-size: 15px;
}

.header-hint {
  font-size: 12px;
}

.shell-content {
  background: var(--hj-bg-app);
}

.nav-label {
  font-weight: 500;
}

@media (max-width: 960px) {
  .shell-content :deep(.n-layout-scroll-container) {
    padding: 16px !important;
  }
}
</style>
