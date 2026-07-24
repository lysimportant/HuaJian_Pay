<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NCard,
  NDataTable,
  NInput,
  NSelect,
  NTag,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { fetchOrders } from '../api/admin'
import { pickMsg } from '../api/client'
import { formatTime, money, statusLabel, statusType } from '../utils/format'

const router = useRouter()
const message = useMessage()
const loading = ref(false)
const rows = ref<any[]>([])
const page = ref(1)
const total = ref(0)
const keyword = ref('')
const status = ref<string | null>(null)

const columns: DataTableColumns<any> = [
  { title: '平台订单号', key: 'trade_no', ellipsis: { tooltip: true } },
  { title: '商户订单号', key: 'out_trade_no', ellipsis: { tooltip: true } },
  { title: '金额', key: 'money', width: 110, render: (r) => money(r.money) },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (r) =>
      h(NTag, { type: statusType(r.status), size: 'small', round: true }, { default: () => statusLabel(r.status) }),
  },
  { title: '创建时间', key: 'addtime', width: 180, render: (r) => formatTime(r.addtime) },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    render: (r) =>
      h(
        NButton,
        {
          text: true,
          type: 'primary',
          onClick: () => router.push({ name: 'order-detail', params: { tradeNo: r.trade_no } }),
        },
        { default: () => '详情' },
      ),
  },
]

async function load() {
  loading.value = true
  try {
    const res: any = await fetchOrders({
      page: page.value,
      page_size: 20,
      trade_no: keyword.value || undefined,
      out_trade_no: keyword.value || undefined,
      status: status.value || undefined,
    })
    rows.value = res?.data?.items || res?.items || []
    total.value = Number(res?.data?.total || res?.total || rows.value.length || 0)
  } catch (e: any) {
    message.error(pickMsg(e, '订单加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="toolbar">
    <n-input v-model:value="keyword" clearable placeholder="搜索平台/商户订单号" />
    <n-select
      v-model:value="status"
      clearable
      placeholder="订单状态"
      :options="[
        { label: '待支付', value: 'pending' },
        { label: '已支付', value: 'paid' },
        { label: '已关闭', value: 'closed' },
      ]"
    />
    <n-button type="primary" :loading="loading" @click="() => { page = 1; load() }">查询</n-button>
  </div>
  <n-card :bordered="false">
    <n-data-table
      :columns="columns"
      :data="rows"
      :loading="loading"
      :pagination="{
        page,
        pageSize: 20,
        itemCount: total,
        onChange: (p: number) => {
          page = p
          load()
        },
      }"
    />
  </n-card>
</template>
