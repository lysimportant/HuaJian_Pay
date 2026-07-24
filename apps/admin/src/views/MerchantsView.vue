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
import { pickMsg } from '../api/client'
import { formatTime } from '../utils/format'

const message = useMessage()
const loading = ref(false)
const rows = ref<any[]>([])
const modal = ref(false)
const form = ref({ name: '', pid: '' })
const createdSecret = ref('')

const columns: DataTableColumns<any> = [
  { title: '商户名称', key: 'name' },
  { title: '商户 PID', key: 'pid' },
  {
    title: '密钥',
    key: 'key',
    ellipsis: { tooltip: true },
    render: (r) => r.key || r.secret || '******',
  },
  { title: '创建时间', key: 'created_at', render: (r) => formatTime(r.created_at || r.addtime) },
]

async function load() {
  loading.value = true
  try {
    const res: any = await fetchMerchants()
    rows.value = res?.data || res || []
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
  <div class="hero">
    <div>
      <h1>商户管理</h1>
      <p>维护商户资料与 API 凭据</p>
    </div>
    <n-button type="primary" @click="openCreate">新增商户</n-button>
  </div>
  <n-card :bordered="false">
    <n-data-table :columns="columns" :data="rows" :loading="loading" />
  </n-card>

  <n-modal v-model:show="modal" preset="card" title="新增商户" style="width: 520px">
    <n-form label-placement="top">
      <n-form-item label="商户名称">
        <n-input v-model:value="form.name" placeholder="可选，默认自动生成" />
      </n-form-item>
      <n-form-item label="商户 PID">
        <n-input v-model:value="form.pid" placeholder="可选，默认自动生成" />
      </n-form-item>
      <n-form-item v-if="createdSecret" label="商户密钥（仅展示一次）">
        <n-input :value="createdSecret" type="textarea" readonly :autosize="{ minRows: 2, maxRows: 4 }" />
      </n-form-item>
      <n-button type="primary" @click="save">{{ createdSecret ? '继续创建' : '确认创建' }}</n-button>
    </n-form>
  </n-modal>
</template>
