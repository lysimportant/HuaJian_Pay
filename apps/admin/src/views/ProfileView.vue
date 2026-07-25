<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSpace,
  NSpin,
  NTag,
  useMessage,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import PageHeader from '../components/PageHeader.vue'
import {
  changeMyPassword,
  createAdminUser,
  fetchMe,
  listAdminUsers,
  updateMe,
  type AdminUserRow,
  type MeUser,
} from '../api/admin'
import { pickMsg } from '../api/client'
import { setAuth, setUsername } from '../utils/auth'

const message = useMessage()
const loading = ref(true)
const savingProfile = ref(false)
const savingPwd = ref(false)
const me = ref<MeUser | null>(null)
const users = ref<AdminUserRow[]>([])
const usersLoading = ref(false)

const profileForm = reactive({ display_name: '' })
const pwdForm = reactive({
  current_password: '',
  new_password: '',
  confirm_password: '',
})
const pwdFormRef = ref<FormInst | null>(null)

const pwdRules: FormRules = {
  current_password: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 10, message: '至少 10 位', trigger: 'blur' },
  ],
  confirm_password: [
    {
      required: true,
      validator: (_r, v: string) => {
        if (!v) return new Error('请再次输入新密码')
        if (v !== pwdForm.new_password) return new Error('两次密码不一致')
        return true
      },
      trigger: ['blur', 'input'],
    },
  ],
}

const createOpen = ref(false)
const createSaving = ref(false)
const createForm = reactive({
  username: '',
  password: '',
  display_name: '',
})

const isAdmin = computed(() => me.value?.role === 'admin')

const columns = computed<DataTableColumns<AdminUserRow>>(() => [
  { title: 'ID', key: 'id', width: 72 },
  { title: '用户名', key: 'username', ellipsis: { tooltip: true } },
  {
    title: '显示名',
    key: 'display_name',
    ellipsis: { tooltip: true },
    render: (r) => r.display_name || '—',
  },
  {
    title: '角色',
    key: 'role',
    width: 100,
    render: (r) =>
      h(
        NTag,
        { size: 'small', type: r.role === 'admin' ? 'primary' : 'default', bordered: false },
        { default: () => r.role },
      ),
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (r) =>
      h(
        NTag,
        {
          size: 'small',
          type: r.status === 'active' ? 'success' : 'warning',
          bordered: false,
        },
        { default: () => r.status },
      ),
  },
  {
    title: '最近登录',
    key: 'last_login_at',
    width: 180,
    render: (r) => r.last_login_at || '—',
  },
])

async function loadMe() {
  const res = await fetchMe()
  if (res.code !== 0 || !res.user) throw new Error(res.msg || '加载个人信息失败')
  me.value = res.user
  profileForm.display_name = res.user.display_name || ''
  if (res.user.username) setUsername(res.user.username)
}

async function loadUsers() {
  if (!isAdmin.value) return
  usersLoading.value = true
  try {
    const res = await listAdminUsers()
    if (res.code !== 0) throw new Error(res.msg || '加载管理员列表失败')
    users.value = res.list || []
  } finally {
    usersLoading.value = false
  }
}

async function bootstrap() {
  loading.value = true
  try {
    await loadMe()
    await loadUsers()
  } catch (e) {
    message.error(pickMsg(e, '加载失败'))
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  savingProfile.value = true
  try {
    const res = await updateMe({
      display_name: profileForm.display_name.trim() || null,
    })
    if (res.code !== 0) throw new Error(res.msg || '保存失败')
    me.value = res.user
    message.success('个人信息已更新')
  } catch (e) {
    message.error(pickMsg(e, '保存失败'))
  } finally {
    savingProfile.value = false
  }
}

async function savePassword() {
  try {
    await pwdFormRef.value?.validate()
  } catch {
    return
  }
  savingPwd.value = true
  try {
    const res = await changeMyPassword({
      current_password: pwdForm.current_password,
      new_password: pwdForm.new_password,
    })
    if (res.code !== 0) throw new Error(res.msg || '修改失败')
    if (res.token) {
      setAuth(res.token, res.user?.username || me.value?.username)
    }
    if (res.user) me.value = res.user
    pwdForm.current_password = ''
    pwdForm.new_password = ''
    pwdForm.confirm_password = ''
    message.success('密码已更新')
  } catch (e) {
    message.error(pickMsg(e, '修改密码失败'))
  } finally {
    savingPwd.value = false
  }
}

async function submitCreate() {
  if (!createForm.username.trim() || !createForm.password) {
    message.warning('请填写用户名和密码')
    return
  }
  createSaving.value = true
  try {
    const res = await createAdminUser({
      username: createForm.username.trim(),
      password: createForm.password,
      display_name: createForm.display_name.trim() || undefined,
      role: 'admin',
    })
    if (res.code !== 0) throw new Error(res.msg || '创建失败')
    message.success('管理员已创建')
    createOpen.value = false
    createForm.username = ''
    createForm.password = ''
    createForm.display_name = ''
    await loadUsers()
  } catch (e) {
    message.error(pickMsg(e, '创建失败'))
  } finally {
    createSaving.value = false
  }
}

onMounted(bootstrap)
</script>

<template>
  <div class="profile-page">
    <PageHeader
      title="个人信息"
      description="查看账号资料、修改显示名与密码；管理员可管理后台账号。"
    />

    <NSpin :show="loading">
      <NSpace vertical :size="16" style="width: 100%">
        <NCard title="基本资料" size="small" :bordered="true">
          <NForm label-placement="left" label-width="96" style="max-width: 480px">
            <NFormItem label="用户名">
              <NInput :value="me?.username || ''" disabled />
            </NFormItem>
            <NFormItem label="角色">
              <NTag :type="me?.role === 'admin' ? 'primary' : 'default'" size="small">
                {{ me?.role || '—' }}
              </NTag>
            </NFormItem>
            <NFormItem label="显示名">
              <NInput
                v-model:value="profileForm.display_name"
                maxlength="64"
                show-count
                placeholder="可选，用于控制台展示"
              />
            </NFormItem>
            <NFormItem label="最近登录">
              <NInput :value="me?.last_login_at || '—'" disabled />
            </NFormItem>
            <NFormItem>
              <NButton type="primary" :loading="savingProfile" @click="saveProfile">
                保存资料
              </NButton>
            </NFormItem>
          </NForm>
        </NCard>

        <NCard title="修改密码" size="small" :bordered="true">
          <NForm
            ref="pwdFormRef"
            :model="pwdForm"
            :rules="pwdRules"
            label-placement="left"
            label-width="96"
            style="max-width: 480px"
          >
            <NFormItem label="当前密码" path="current_password">
              <NInput
                v-model:value="pwdForm.current_password"
                type="password"
                show-password-on="click"
                autocomplete="current-password"
              />
            </NFormItem>
            <NFormItem label="新密码" path="new_password">
              <NInput
                v-model:value="pwdForm.new_password"
                type="password"
                show-password-on="click"
                autocomplete="new-password"
              />
            </NFormItem>
            <NFormItem label="确认密码" path="confirm_password">
              <NInput
                v-model:value="pwdForm.confirm_password"
                type="password"
                show-password-on="click"
                autocomplete="new-password"
              />
            </NFormItem>
            <NFormItem>
              <NButton type="primary" :loading="savingPwd" @click="savePassword">
                更新密码
              </NButton>
            </NFormItem>
          </NForm>
        </NCard>

        <NCard v-if="isAdmin" title="管理员账号" size="small" :bordered="true">
          <template #header-extra>
            <NButton size="small" type="primary" @click="createOpen = true">新建管理员</NButton>
          </template>
          <NAlert type="info" :bordered="false" style="margin-bottom: 12px">
            接口：GET/POST/PATCH <code>/admin/api/admin-users</code>；本人资料为
            <code>/admin/api/me</code> 与 <code>/admin/api/me/password</code>。
          </NAlert>
          <NDataTable
            :columns="columns"
            :data="users"
            :loading="usersLoading"
            :bordered="false"
            size="small"
            :single-line="false"
          />
        </NCard>
      </NSpace>
    </NSpin>

    <NModal
      v-model:show="createOpen"
      preset="card"
      title="新建管理员"
      style="width: 420px; max-width: 92vw"
      :mask-closable="false"
    >
      <NForm label-placement="left" label-width="88">
        <NFormItem label="用户名" required>
          <NInput v-model:value="createForm.username" maxlength="32" />
        </NFormItem>
        <NFormItem label="密码" required>
          <NInput
            v-model:value="createForm.password"
            type="password"
            show-password-on="click"
            maxlength="64"
          />
        </NFormItem>
        <NFormItem label="显示名">
          <NInput v-model:value="createForm.display_name" maxlength="64" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="createOpen = false">取消</NButton>
          <NButton type="primary" :loading="createSaving" @click="submitCreate">创建</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 960px;
}
code {
  font-size: 12px;
}
</style>
