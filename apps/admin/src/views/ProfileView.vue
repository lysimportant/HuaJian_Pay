<script setup lang="ts">
import { computed, h, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useMessage,
  type DataTableColumns,
  type SelectOption,
} from 'naive-ui'
import PageHeader from '../components/PageHeader.vue'
import {
  adminStatusLabel,
  changeMyPassword,
  createAdminUser,
  deleteAdminUser,
  fetchMe,
  listAdminUsers,
  patchAdminUser,
  roleLabel,
  updateMe,
  type AdminUserRow,
  type MeUser,
} from '../api/admin'
import { pickMsg } from '../utils/format'
import { setAuth, getUsername } from '../utils/auth'

const message = useMessage()

const me = ref<MeUser | null>(null)
const meLoading = ref(false)
const profileSaving = ref(false)
const passwordSaving = ref(false)

const profileForm = reactive({ display_name: '' })
const passwordForm = reactive({
  current_password: '',
  new_password: '',
  confirm_password: '',
})

/** admin / super_admin 可管理账号；viewer 不渲染账号管理 */
const canManageUsers = computed(() => {
  const r = me.value?.role
  return r === 'admin' || r === 'super_admin'
})

const users = ref<AdminUserRow[]>([])
const usersLoading = ref(false)
const filters = reactive({
  keyword: '',
  role: 'all' as string,
  status: 'all' as string,
})

const roleFilterOptions: SelectOption[] = [
  { label: '全部角色', value: 'all' },
  { label: '管理员', value: 'admin' },
  { label: '普通用户', value: 'viewer' },
  { label: '超级管理员', value: 'super_admin' },
]

const statusFilterOptions: SelectOption[] = [
  { label: '全部状态', value: 'all' },
  { label: '启用', value: 'active' },
  { label: '禁用', value: 'disabled' },
]

/** 创建角色仅「管理员 / 普通用户」 */
const createRoleOptions: SelectOption[] = [
  { label: '管理员', value: 'admin' },
  { label: '普通用户', value: 'viewer' },
]

const editRoleOptions: SelectOption[] = [
  { label: '管理员', value: 'admin' },
  { label: '普通用户', value: 'viewer' },
]

const createOpen = ref(false)
const createSaving = ref(false)
const createForm = reactive({
  username: '',
  password: '',
  display_name: '',
  role: 'viewer' as 'admin' | 'viewer',
})

const editOpen = ref(false)
const editSaving = ref(false)
const editTarget = ref<AdminUserRow | null>(null)
const editForm = reactive({
  display_name: '',
  status: 'active' as 'active' | 'disabled',
  role: 'viewer' as 'admin' | 'viewer',
  password: '',
})

function roleTagType(role: string): 'default' | 'info' | 'warning' {
  if (role === 'super_admin') return 'warning'
  if (role === 'admin') return 'info'
  return 'default'
}

function statusTagType(status: string): 'success' | 'error' | 'default' {
  if (status === 'active') return 'success'
  if (status === 'disabled') return 'error'
  return 'default'
}

async function loadMe() {
  meLoading.value = true
  try {
    const res = await fetchMe()
    if (res?.code !== 0 || !res.user) {
      message.error(res?.msg || '加载个人信息失败')
      return
    }
    me.value = res.user
    profileForm.display_name = res.user.display_name || ''
  } catch (e) {
    message.error(pickMsg(e, '加载个人信息失败'))
  } finally {
    meLoading.value = false
  }
}

async function saveProfile() {
  if (profileSaving.value) return
  profileSaving.value = true
  try {
    const res = await updateMe({
      display_name: profileForm.display_name.trim() || null,
    })
    if (res?.code !== 0 || !res.user) {
      message.error(res?.msg || '保存失败')
      return
    }
    me.value = res.user
    message.success('个人资料已保存')
  } catch (e) {
    message.error(pickMsg(e, '保存失败'))
  } finally {
    profileSaving.value = false
  }
}

async function savePassword() {
  if (passwordSaving.value) return
  if (!passwordForm.current_password || !passwordForm.new_password) {
    message.warning('请填写当前密码与新密码')
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
  passwordSaving.value = true
  try {
    const res = await changeMyPassword({
      current_password: passwordForm.current_password,
      new_password: passwordForm.new_password,
    })
    if (res?.code !== 0) {
      message.error(res?.msg || '修改密码失败')
      return
    }
    if (res.token) {
      setAuth(
        res.token,
        res.user?.username || me.value?.username || getUsername() || undefined,
      )
    }
    if (res.user) me.value = res.user
    passwordForm.current_password = ''
    passwordForm.new_password = ''
    passwordForm.confirm_password = ''
    message.success('密码已更新')
  } catch (e) {
    message.error(pickMsg(e, '修改密码失败'))
  } finally {
    passwordSaving.value = false
  }
}

async function loadUsers() {
  if (!canManageUsers.value) return
  usersLoading.value = true
  try {
    const res = await listAdminUsers({
      keyword: filters.keyword,
      role: filters.role,
      status: filters.status,
    })
    if (res?.code !== 0) {
      message.error(res?.msg || '加载用户列表失败')
      return
    }
    users.value = res.list || []
  } catch (e) {
    message.error(pickMsg(e, '加载用户列表失败'))
  } finally {
    usersLoading.value = false
  }
}

function openCreate() {
  createForm.username = ''
  createForm.password = ''
  createForm.display_name = ''
  createForm.role = 'viewer'
  createOpen.value = true
}

async function submitCreate() {
  if (createSaving.value) return
  if (!createForm.username.trim() || !createForm.password) {
    message.warning('请填写用户名与密码')
    return
  }
  if (createForm.password.length < 8) {
    message.warning('密码至少 8 位')
    return
  }
  createSaving.value = true
  try {
    const res = await createAdminUser({
      username: createForm.username.trim(),
      password: createForm.password,
      display_name: createForm.display_name.trim() || undefined,
      role: createForm.role,
    })
    if (res?.code !== 0) {
      message.error(res?.msg || '创建失败')
      return
    }
    message.success('用户已创建')
    createOpen.value = false
    await loadUsers()
  } catch (e) {
    message.error(pickMsg(e, '创建失败'))
  } finally {
    createSaving.value = false
  }
}

function openEdit(row: AdminUserRow) {
  editTarget.value = row
  editForm.display_name = row.display_name || ''
  editForm.status = row.status === 'disabled' ? 'disabled' : 'active'
  editForm.role = row.role === 'admin' ? 'admin' : 'viewer'
  editForm.password = ''
  editOpen.value = true
}

async function submitEdit() {
  if (editSaving.value || !editTarget.value) return
  const id = editTarget.value.id
  const isSuper = editTarget.value.role === 'super_admin'
  editSaving.value = true
  try {
    const body: {
      display_name?: string | null
      status?: 'active' | 'disabled'
      role?: 'admin' | 'viewer'
      password?: string
    } = {
      display_name: editForm.display_name.trim() || null,
      status: editForm.status,
    }
    if (!isSuper) body.role = editForm.role
    if (editForm.password.trim()) {
      if (editForm.password.length < 8) {
        message.warning('重置密码至少 8 位')
        editSaving.value = false
        return
      }
      body.password = editForm.password.trim()
    }
    const res = await patchAdminUser(id, body)
    if (res?.code !== 0) {
      message.error(res?.msg || '更新失败')
      return
    }
    message.success('用户已更新')
    editOpen.value = false
    await loadUsers()
    if (me.value?.id === id) await loadMe()
  } catch (e) {
    message.error(pickMsg(e, '更新失败'))
  } finally {
    editSaving.value = false
  }
}

async function onDelete(row: AdminUserRow) {
  try {
    const res = await deleteAdminUser(row.id)
    if (res?.code !== 0) {
      message.error(res?.msg || '删除失败')
      return
    }
    message.success('用户已删除')
    await loadUsers()
  } catch (e) {
    message.error(pickMsg(e, '删除失败'))
  }
}

const columns = computed<DataTableColumns<AdminUserRow>>(() => [
  { title: 'ID', key: 'id', width: 64 },
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
    width: 120,
    render: (r) =>
      h(
        NTag,
        { size: 'small', type: roleTagType(r.role), bordered: false },
        { default: () => roleLabel(r.role) },
      ),
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (r) =>
      h(
        NTag,
        { size: 'small', type: statusTagType(r.status), bordered: false },
        { default: () => adminStatusLabel(r.status) },
      ),
  },
  {
    title: '最近登录',
    key: 'last_login_at',
    width: 170,
    render: (r) => r.last_login_at || '—',
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    render: (r) =>
      h(
        NSpace,
        { size: 6 },
        {
          default: () => [
            h(
              NButton,
              { size: 'tiny', secondary: true, onClick: () => openEdit(r) },
              { default: () => '编辑' },
            ),
            h(
              NPopconfirm,
              { onPositiveClick: () => onDelete(r) },
              {
                trigger: () =>
                  h(
                    NButton,
                    {
                      size: 'tiny',
                      type: 'error',
                      secondary: true,
                      disabled: r.id === me.value?.id,
                    },
                    { default: () => '删除' },
                  ),
                default: () => `确认删除用户「${r.username}」？此操作不可恢复。`,
              },
            ),
          ],
        },
      ),
  },
])

onMounted(async () => {
  await loadMe()
  if (canManageUsers.value) await loadUsers()
})
</script>

<template>
  <div class="profile-page">
    <PageHeader title="个人信息" description="管理个人资料与密码。管理员可在此维护账号。" />

    <NSpace vertical :size="16" style="width: 100%">
      <NCard title="个人资料" size="small" :bordered="true">
        <NForm label-placement="left" label-width="96" style="max-width: 480px">
          <NFormItem label="用户名">
            <NInput :value="me?.username || ''" disabled />
          </NFormItem>
          <NFormItem label="角色">
            <NInput :value="roleLabel(me?.role)" disabled />
          </NFormItem>
          <NFormItem label="显示名">
            <NInput
              v-model:value="profileForm.display_name"
              placeholder="可选显示名称"
              :disabled="meLoading || profileSaving"
              maxlength="64"
            />
          </NFormItem>
          <NFormItem>
            <NButton
              type="primary"
              :loading="profileSaving"
              :disabled="meLoading"
              @click="saveProfile"
            >
              保存资料
            </NButton>
          </NFormItem>
        </NForm>
      </NCard>

      <NCard title="修改密码" size="small" :bordered="true">
        <NForm label-placement="left" label-width="96" style="max-width: 480px">
          <NFormItem label="当前密码">
            <NInput
              v-model:value="passwordForm.current_password"
              type="password"
              show-password-on="click"
              autocomplete="current-password"
              :disabled="passwordSaving"
            />
          </NFormItem>
          <NFormItem label="新密码">
            <NInput
              v-model:value="passwordForm.new_password"
              type="password"
              show-password-on="click"
              autocomplete="new-password"
              placeholder="至少 8 位"
              :disabled="passwordSaving"
            />
          </NFormItem>
          <NFormItem label="确认新密码">
            <NInput
              v-model:value="passwordForm.confirm_password"
              type="password"
              show-password-on="click"
              autocomplete="new-password"
              :disabled="passwordSaving"
            />
          </NFormItem>
          <NFormItem>
            <NButton type="primary" :loading="passwordSaving" @click="savePassword">
              更新密码
            </NButton>
          </NFormItem>
        </NForm>
      </NCard>

      <NCard v-if="canManageUsers" title="账号管理" size="small" :bordered="true">
        <template #header-extra>
          <NButton type="primary" size="small" @click="openCreate">创建用户</NButton>
        </template>

        <NSpace class="user-filters" wrap :size="8" style="margin-bottom: 12px">
          <NInput
            v-model:value="filters.keyword"
            clearable
            placeholder="用户名 / 显示名"
            style="width: 180px"
            @keyup.enter="loadUsers"
          />
          <NSelect
            v-model:value="filters.role"
            :options="roleFilterOptions"
            style="width: 140px"
          />
          <NSelect
            v-model:value="filters.status"
            :options="statusFilterOptions"
            style="width: 120px"
          />
          <NButton :loading="usersLoading" @click="loadUsers">查询</NButton>
        </NSpace>

        <NDataTable
          :columns="columns"
          :data="users"
          :loading="usersLoading"
          :bordered="false"
          size="small"
          :scroll-x="900"
        />
      </NCard>
    </NSpace>

    <NModal
      v-model:show="createOpen"
      preset="card"
      title="创建用户"
      style="width: 440px; max-width: 92vw"
      :mask-closable="!createSaving"
    >
      <NForm label-placement="left" label-width="88">
        <NFormItem label="用户名" required>
          <NInput v-model:value="createForm.username" autocomplete="off" />
        </NFormItem>
        <NFormItem label="密码" required>
          <NInput
            v-model:value="createForm.password"
            type="password"
            show-password-on="click"
            placeholder="至少 8 位"
          />
        </NFormItem>
        <NFormItem label="显示名">
          <NInput v-model:value="createForm.display_name" />
        </NFormItem>
        <NFormItem label="角色" required>
          <NSelect v-model:value="createForm.role" :options="createRoleOptions" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton :disabled="createSaving" @click="createOpen = false">取消</NButton>
          <NButton type="primary" :loading="createSaving" @click="submitCreate">创建</NButton>
        </NSpace>
      </template>
    </NModal>

    <NModal
      v-model:show="editOpen"
      preset="card"
      title="编辑用户"
      style="width: 440px; max-width: 92vw"
      :mask-closable="!editSaving"
    >
      <NForm label-placement="left" label-width="96">
        <NFormItem label="用户名">
          <NInput :value="editTarget?.username || ''" disabled />
        </NFormItem>
        <NFormItem v-if="editTarget?.role === 'super_admin'" label="角色">
          <NInput :value="roleLabel('super_admin')" disabled />
          <template #feedback>超级管理员角色只读展示，不可在此修改。</template>
        </NFormItem>
        <NFormItem v-else label="角色">
          <NSelect v-model:value="editForm.role" :options="editRoleOptions" />
        </NFormItem>
        <NFormItem label="显示名">
          <NInput v-model:value="editForm.display_name" />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect
            v-model:value="editForm.status"
            :options="[
              { label: '启用', value: 'active' },
              { label: '禁用', value: 'disabled' },
            ]"
          />
        </NFormItem>
        <NFormItem label="重置密码">
          <NInput
            v-model:value="editForm.password"
            type="password"
            show-password-on="click"
            placeholder="留空则不修改密码"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton :disabled="editSaving" @click="editOpen = false">取消</NButton>
          <NButton type="primary" :loading="editSaving" @click="submitEdit">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.profile-page {
  width: 100%;
}
.user-filters {
  width: 100%;
}
</style>
