<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard, NForm, NFormItem, NInput, useMessage } from 'naive-ui'
import { login } from '../api/admin'
import { pickMsg } from '../api/client'
import { setToken } from '../utils/auth'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const loading = ref(false)
const username = ref('admin')
const password = ref('')

async function onLogin() {
  loading.value = true
  try {
    const res: any = await login(username.value, password.value)
    const token = res?.data?.token || res?.token
    if (!token) throw new Error('登录响应缺少 token')
    setToken(token)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect || '/dashboard')
  } catch (e: any) {
    message.error(pickMsg(e, '登录失败'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login-brand">
      <div class="brand-mark">花</div>
      <h1>花间支付</h1>
      <p>安全、稳定、清晰的聚合支付管理平台</p>
    </div>
    <n-card class="login-card" :bordered="false">
      <h2>欢迎回来</h2>
      <p class="muted">登录管理控制台</p>
      <n-form @submit.prevent="onLogin">
        <n-form-item label="管理员账号">
          <n-input v-model:value="username" placeholder="请输入账号" />
        </n-form-item>
        <n-form-item label="密码">
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="请输入密码"
            @keyup.enter="onLogin"
          />
        </n-form-item>
        <n-button type="primary" block size="large" :loading="loading" @click="onLogin">
          登 录
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>
