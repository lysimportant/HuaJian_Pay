<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, NText, useMessage } from 'naive-ui'
import { login } from '../api/admin'
import { setAuth } from '../utils/auth'
import { pickMsg } from '../utils/format'

const router = useRouter()
const message = useMessage()
const loading = ref(false)
const form = reactive({ username: 'admin', password: '' })

async function submit() {
  if (loading.value) return
  if (!form.username || !form.password) {
    message.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    const res = await login(form.username, form.password)
    if (res && typeof res.code === 'number' && res.code !== 0) {
      message.error(res.msg || '登录失败')
      return
    }
    const token = res?.token || res?.data?.token || res?.access_token
    const username =
      res?.user?.username || res?.username || res?.data?.username || form.username
    if (!token) {
      message.error(res?.msg || '登录失败')
      return
    }
    setAuth(String(token), String(username))
    message.success('登录成功')
    router.replace('/dashboard')
  } catch (e) {
    // Single toast with accurate server msg (e.g. 用户名或密码错误)
    message.error(pickMsg(e, '登录失败'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-bg" aria-hidden="true" />
    <NCard class="login-card" :bordered="true">
      <div class="login-brand">
        <div class="login-mark" aria-hidden="true">H</div>
        <div>
          <h1>花间支付</h1>
          <p>运营控制台登录</p>
        </div>
      </div>
      <NText depth="3" class="login-hint">
        使用管理员账号登录。密码错误时显示服务端返回的准确提示。
      </NText>
      <NForm :model="form" size="large" @submit.prevent="submit">
        <NFormItem label="用户名" path="username">
          <NInput
            v-model:value="form.username"
            autocomplete="username"
            placeholder="请输入用户名"
            @keyup.enter="submit"
          />
        </NFormItem>
        <NFormItem label="密码" path="password">
          <NInput
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            autocomplete="current-password"
            placeholder="请输入密码"
            @keyup.enter="submit"
          />
        </NFormItem>
        <NButton
          type="primary"
          block
          :loading="loading"
          :disabled="loading"
          attr-type="submit"
          class="login-btn"
        >
          登录
        </NButton>
      </NForm>
    </NCard>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  position: relative;
  overflow: hidden;
  background: var(--hj-bg-app);
}
.login-bg {
  position: absolute;
  inset: -20%;
  background:
    radial-gradient(circle at 20% 20%, rgba(37, 99, 235, 0.18), transparent 40%),
    radial-gradient(circle at 80% 30%, rgba(14, 165, 233, 0.16), transparent 36%),
    radial-gradient(circle at 50% 80%, rgba(99, 102, 241, 0.12), transparent 40%);
  pointer-events: none;
}
.login-card {
  width: min(420px, 100%);
  position: relative;
  z-index: 1;
  border-radius: 18px;
  box-shadow: var(--hj-shadow-elevated);
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.login-mark {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
}
.login-brand h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
}
.login-brand p {
  margin: 2px 0 0;
  color: var(--hj-text-secondary);
  font-size: 13px;
}
.login-hint {
  display: block;
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
}
.login-btn {
  margin-top: 4px;
}
</style>
