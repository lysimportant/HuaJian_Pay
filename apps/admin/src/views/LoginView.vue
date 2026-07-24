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
const form = reactive({ username: 'admin', password: 'admin123' })

async function submit() {
  if (!form.username || !form.password) {
    message.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    const res = await login(form.username, form.password)
    const token = res?.token || res?.data?.token || res?.access_token
    const username = res?.username || res?.data?.username || form.username
    if (!token) throw new Error('登录响应缺少 token')
    setAuth(String(token), String(username))
    message.success('登录成功')
    router.replace('/dashboard')
  } catch (e) {
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
      <NForm @submit.prevent="submit">
        <NFormItem label="用户名">
          <NInput v-model:value="form.username" placeholder="admin" autocomplete="username" />
        </NFormItem>
        <NFormItem label="密码">
          <NInput
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            placeholder="密码"
            autocomplete="current-password"
            @keyup.enter="submit"
          />
        </NFormItem>
        <NButton type="primary" block :loading="loading" attr-type="submit" class="login-btn" @click="submit">
          登录
        </NButton>
      </NForm>
      <NText depth="3" class="login-tip">默认账号见部署文档，生产环境请立即修改密码</NText>
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
  inset: 0;
  background:
    radial-gradient(900px 400px at 10% -10%, rgb(29 78 216 / 14%), transparent 55%),
    radial-gradient(700px 360px at 100% 0%, rgb(15 118 110 / 10%), transparent 50%),
    var(--hj-bg-app);
  pointer-events: none;
}

.login-card {
  width: 100%;
  max-width: 400px;
  position: relative;
  border-radius: 16px !important;
  box-shadow: var(--hj-shadow-elevated) !important;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}

.login-mark {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(145deg, var(--hj-primary), #1e3a8a);
  box-shadow: 0 6px 16px rgb(29 78 216 / 28%);
}

.login-brand h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--hj-text);
}

.login-brand p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--hj-text-muted);
}

.login-btn {
  margin-top: 4px;
  height: 40px;
  font-weight: 600;
}

.login-tip {
  display: block;
  margin-top: 16px;
  font-size: 12px;
  line-height: 1.5;
}
</style>
