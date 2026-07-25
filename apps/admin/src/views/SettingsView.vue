<script setup lang="ts">
import {
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NRadioButton,
  NRadioGroup,
  NSpace,
  NText,
  useMessage,
} from 'naive-ui'
import PageHeader from '../components/PageHeader.vue'
import { useTheme } from '../composables/useTheme'
import type { ThemeMode } from '../utils/theme'

const message = useMessage()
const { mode, setMode } = useTheme()

function onThemeChange(v: string | number | boolean | undefined) {
  const next = String(v) as ThemeMode
  setMode(next)
  message.success(
    next === 'light' ? '已切换浅色主题' : next === 'dark' ? '已切换深色主题' : '已跟随系统主题',
  )
}
</script>

<template>
  <div>
    <PageHeader title="系统设置" description="外观与运行模式说明" />
    <NSpace vertical :size="16" style="width: 100%">
      <NCard title="外观" :bordered="true" class="page-card">
        <NSpace align="center" :size="16">
          <NText>主题模式</NText>
          <NRadioGroup :value="mode" @update:value="onThemeChange">
            <NRadioButton value="light">浅色</NRadioButton>
            <NRadioButton value="dark">深色</NRadioButton>
            <NRadioButton value="system">跟随系统</NRadioButton>
          </NRadioGroup>
        </NSpace>
      </NCard>

      <NCard title="运行说明" :bordered="true" class="page-card">
        <NDescriptions label-placement="left" :column="1" bordered>
          <NDescriptionsItem label="前端">
            Vue 3 + Vite + Naive UI（apps/admin）
          </NDescriptionsItem>
          <NDescriptionsItem label="API 前缀">
            <NText code>/admin/api</NText>
            （开发环境由 Vite 代理到后端）
          </NDescriptionsItem>
          <NDescriptionsItem label="认证">
            Bearer Token（localStorage，默认 12 小时）
          </NDescriptionsItem>
          <NDescriptionsItem label="通道">
            支付宝 / 微信配置页可切换 mock / live；密钥不回显
          </NDescriptionsItem>
          <NDescriptionsItem label="说明">
            敏感配置请通过服务端环境变量与通道配置接口管理，避免在浏览器持久化密钥。
          </NDescriptionsItem>
        </NDescriptions>
      </NCard>
    </NSpace>
  </div>
</template>
