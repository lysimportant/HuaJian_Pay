<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import {
  NButton,
  NCard,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { createMerchant, fetchMerchants } from '../api/admin'
import { pickMsg, formatTime } from '../utils/format'
import PageHeader from '../components/PageHeader.vue'
import EmptyState from '../components/EmptyState.vue'

const message = useMessage()
const loading = ref(false)
const rows = ref<any[]>([])
const modal = ref(false)
const form = ref({ name: '', pid: '' })
const createdSecret = ref('')

const columns: DataTableColumns<any> = [
  { title: '商户名称', key: 'name' },
  {
    title: '商户 PID',
    key: 'pid',
    render: (r) => h('span', { class: 'mono' }, String(r.pid ?? '-')),
  },
  {
    title: '密钥',
    key: 'key',
    ellipsis: { tooltip: true },
    // Never surface raw secrets in list (audit P0)
    render: () => h('span', { class: 'muted mono' }, '••••••••'),
  },
  {
    title: '创建时间',
    key: 'created_at',
    render: (r) => formatTime(r.created_at || r.addtime),
  },
]

async function load() {
  loading.value = true
  try {
    const res: any = await fetchMerchants()
    const data = res?.data || res
    rows.value = Array.isArray(data) ? data : data?.list || data?.items || []
  } catch (e: any) {
    message.error(pickMsg(e, '商户列表加载失败'))
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = { name: '', pid: '' }
  createdSecret.value = ''
  modal.value = true
}

async function save() {
  try {
    const res: any = await createMerchant({ ...form.value })
    const data = res?.data || res
    createdSecret.value = data?.key || data?.secret || ''
    message.success('商户已创建')
    if (!createdSecret.value) modal.value = false
    await load()
  } catch (e: any) {
    message.error(pickMsg(e, '创建失败'))
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader title="商户管理" description="维护商户资料；API 密钥仅在创建时展示一次">
      <template #extra>
        <NButton type="primary" @click="openCreate">新增商户</NButton>
      </template>
    </PageHeader>
    <NCard :bordered="true" class="page-card">
      <div class="table-scroll">
        <NDataTable v-if="rows.length || loading" :columns="columns" :data="rows" :loading="loading" :bordered="false" />
        <EmptyState
          v-else
          title="暂无商户"
          description="创建商户后可获得 pid 与 API 密钥"
        >
          <template #action>
            <NButton type="primary" @click="openCreate">新增商户</NButton>
          </template>
        </EmptyState>
      </div>
    </NCard>

    <NModal v-model:show="modal" preset="card" title="新增商户" style="width: 520px">
      <NForm label-placement="top">
        <NFormItem label="商户名称">
          <NInput v-model:value="form.name" placeholder="可选，默认自动生成" />
        </NFormItem>
        <NFormItem label="商户 PID">
          <NInput v-model:value="form.pid" placeholder="可选，默认自动生成" />
        </NFormItem>
        <NFormItem v-if="createdSecret" label="商户密钥（仅展示一次）">
          <NInput
            :value="createdSecret"
            type="textarea"
            readonly
            :autosize="{ minRows: 2, maxRows: 4 }"
            class="mono"
          />
        </NFormItem>
        <NButton type="primary" @click="save">{{ createdSecret ? '继续创建' : '确认创建' }}</NButton>
      </NForm>
    </NModal>
  </div>
</template>
