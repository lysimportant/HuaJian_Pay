<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  NMenu,
  NText,
  type MenuOption,
} from 'naive-ui'
import { clearToken } from '../utils/auth'

const route = useRoute()
const router = useRouter()

const titles: Record<string, string> = {
  dashboard: '数据概览',
  orders: '订单管理',
  'order-detail': '订单详情',
  alipay: '支付宝配置',
  merchants: '商户管理',
  settings: '系统设置',
}

const active = computed(() => {
  const name = String(route.name || '')
  if (name === 'order-detail') return 'orders'
  if (name === 'alipay') return 'alipay'
  return name || 'dashboard'
})

const pageTitle = computed(() => titles[String(route.name || '')] || '运营管理控制台')

const menuOptions: MenuOption[] = [
  { label: '数据概览', key: 'dashboard' },
  { label: '订单管理', key: 'orders' },
  { label: '支付宝配置', key: 'alipay' },
  { label: '商户管理', key: 'merchants' },
  { label: '系统设置', key: 'settings' },
]

function onMenu(key: string) {
  if (key === 'alipay') router.push({ name: 'alipay' })
  else router.push({ name: key })
}

function logout() {
  clearToken()
  router.push({ name: 'login' })
}
</script>

<template>
  <n-layout has-sider class="shell">
    <n-layout-sider bordered :width="224">
      <div class="logo">
        <span>花</span>
        <b>花间支付</b>
      </div>
      <n-menu :value="active" :options="menuOptions" @update:value="onMenu" />
    </n-layout-sider>
    <n-layout>
      <n-layout-header bordered class="header">
        <div>
          <b>{{ pageTitle }}</b>
          <small>运营管理控制台</small>
        </div>
        <div>
          <n-text depth="3">管理员</n-text>
          <n-button quaternary @click="logout">退出登录</n-button>
        </div>
      </n-layout-header>
      <n-layout-content class="content">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>
