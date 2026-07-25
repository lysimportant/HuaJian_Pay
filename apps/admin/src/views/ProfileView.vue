<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NSpace,
  NSpin,
  NText,
  useMessage,
} from 'naive-ui'
import {
  changeProfilePassword,
  fetchProfile,
  updateProfile,
} from '../api/admin'
import PageHeader from '../components/PageHeader.vue'
import { clearToken } from '../utils/auth'
import { useRouter } from 'vue-router'

const message = useMessage()
const router = useRouter()
const loading = ref(false)
const savingProfile = ref(false)
const savingPassword = ref(false)

const profile = reactive({
  id: '',
  username: '',
  display_name: '',
  role: '',
  status: '',
})

const passwordForm = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
})

async function load() {
  loading.value = true
  try {
    const res = await fetchProfile()
    const data = res.user || res.data || res
    profile.id = String(data.id ?? data.user_id ?? '')
    profile.username = String(data.username ?? '')
    profile.display_name = String(data.display_name ?? data.displayName ?? '')
    profile.role = String(data.role ?? '')
    profile.status = String(data.status ?? '')
  } catch (e: any) {
    message.error(e?.message || '加载个人信息失败（后端接口可能尚未就绪）')
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  if (!profile.username.trim()) {
    message.warning('用户名不能为空')
    return
  }
  savingProfile.value = true
  try {
    await updateProfile({
      username: profile.username.trim(),
      display_name: profile.display_name.trim(),
    })
    message.success('个人信息已保存')
    await load()
  } catch (e: any) {
    message.error(e?.message || '保存个人信息失败')
  } finally {
    savingProfile.value = false
  }
}

async function savePassword() {
  if (!passwordForm.old_password || !passwordForm.new_password) {
    message.warning('请填写完整密码')
    return
  }
  if (passwordForm.new_password.length < 8) {
    message.warning('新密码至少 8 位')
    return
  }
  if (passwordForm.new_password !== passwordForm.confirm_password) {
    message.warning('两次输入的新密码不一致')
    return
  }
  savingPassword.value = true
  try {
    await changeProfilePassword({
      old_password: passwordForm.old_password,
      new_password: passwordForm.new_password,
    })
    message.success('密码已修改，请重新登录')
    passwordForm.old_password = ''
    passwordForm.new_password = ''
    passwordForm.confirm_password = ''
    clearToken()
    router.replace('/login')
  } catch (e: any) {
    message.error(e?.message || '修改密码失败')
  } finally {
    savingPassword.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader title="个人信息" description="管理显示名、登录用户名与密码">
      <template #extra>
        <NButton secondary :loading="loading" @click="load">刷新</NButton>
      </template>
    </PageHeader>

    <NSpin :show="loading">
      <NSpace vertical :size="16" style="width: 100%">
        <NCard title="基本资料" :bordered="true" class="page-card">
          <NForm label-placement="left" label-width="100" style="max-width: 520px">
            <NFormItem label="用户 ID">
              <NText depth="3">{{ profile.id || '—' }}</NText>
            </NFormItem>
            <NFormItem label="角色">
              <NText depth="3">{{ profile.role || '—' }}</NText>
            </NFormItem>
            <NFormItem label="用户名" required>
              <NInput v-model:value="profile.username" placeholder="登录用户名" maxlength="64" />
            </NFormItem>
            <NFormItem label="显示名">
              <NInput
                v-model:value="profile.display_name"
                placeholder="界面展示名称"
                maxlength="64"
              />
            </NFormItem>
            <NFormItem>
              <NButton type="primary" :loading="savingProfile" @click="saveProfile">
                保存资料
              </NButton>
            </NFormItem>
          </NForm>
        </NCard>

        <NCard title="修改密码" :bordered="true" class="page-card">
          <NForm label-placement="left" label-width="100" style="max-width: 520px">
            <NFormItem label="当前密码" required>
              <NInput
                v-model:value="passwordForm.old_password"
                type="password"
                show-password-on="click"
                placeholder="当前登录密码"
              />
            </NFormItem>
            <NFormItem label="新密码" required>
              <NInput
                v-model:value="passwordForm.new_password"
                type="password"
                show-password-on="click"
                placeholder="至少 8 位"
              />
            </NFormItem>
            <NFormItem label="确认新密码" required>
              <NInput
                v-model:value="passwordForm.confirm_password"
                type="password"
                show-password-on="click"
                placeholder="再次输入新密码"
              />
            </NFormItem>
            <NFormItem>
              <NButton type="primary" :loading="savingPassword" @click="savePassword">
                更新密码
              </NButton>
            </NFormItem>
          </NForm>
          <NText depth="3" style="font-size: 12px">
            约定接口：GET/PUT /admin/profile，PUT /admin/profile/password。后端就绪后自动联调。
          </NText>
        </NCard>
      </NSpace>
    </NSpin>
  </div>
</template>
