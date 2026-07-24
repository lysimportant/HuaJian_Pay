<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NDataTable, NSpin, useMessage, type DataTableColumns } from 'naive-ui'
import { fetchOrders } from '../api/admin'
import { formatTime, money, pickMsg } from '../utils/format'
import PageHeader from '../components/PageHeader.vue'
import KpiCard from '../components/KpiCard.vue'
import StatusTag from '../components/StatusTag.vue'
import EmptyState from '../components/EmptyState.vue'

const message = useMessage()
const router = useRouter()
const loading = ref(true)
const orderCountVal = ref('0')
const successCountVal = ref('0')
const failNotifyVal = ref('0')
const amountSumVal = ref('¥0.00')
const recent = ref<Record<string, unknown>[]>([])

const columns: DataTableColumns<Record<string, unknown>> = [
  {
    title: '订单号',
    key: 'trade_no',
    ellipsis: { tooltip: true },
    render: (r) => h('span', { class: 'mono' }, String(r.trade_no ?? r.order_no ?? '-')),
  },
  {
    title: '金额',
    key: 'money',
    width: 120,
    render: (r) => h('span', { class: 'amount' }, money(r.money)),
  },
  {
    title: '状态',
    key: 'status',
    width: 120,
    render: (r) => h(StatusTag, { status: r.status as string | number }),
  },
  {
    title: '创建时间',
    key: 'created_at',
    width: 180,
    render: (r) => formatTime(r.created_at),
  },
]

function isPaid(status: unknown) {
  const s = String(status || '').toLowerCase()
  return s === 'paid' || s === 'success'
}

function isNotifyFailed(row: Record<string, unknown>) {
  const n = String(row.notify_status || '').toLowerCase()
  return n.includes('fail') || n === 'failed'
}

onMounted(async () => {
  loading.value = true
  try {
    // No dedicated dashboard API in contract — derive from orders list
    const data = await fetchOrders({ page: 1, page_size: 50 })
    const list = (data?.list || data?.items || data?.orders || data?.data || []) as Record<
      string,
      unknown
    >[]
    recent.value = list.slice(0, 10)
    const total = Number(data?.total ?? list.length)
    orderCountVal.value = String(total)
    const paid = list.filter((r) => isPaid(r.status))
    successCountVal.value = String(paid.length)
    amountSumVal.value = money(paid.reduce((sum, r) => sum + Number(r.money || 0), 0))
    failNotifyVal.value = String(list.filter((r) => isPaid(r.status) && isNotifyFailed(r)).length)
  } catch (e) {
    message.error(pickMsg(e, '加载概览失败'))
  } finally {
    loading.value = false
  }
})

function openOrder(row: Record<string, unknown>) {
  const id = row.trade_no || row.order_no
  if (id) router.push(`/orders/${id}`)
}
</script>

<template>
  <div>
    <PageHeader title="概览" description="基于订单列表汇总的经营快照；通知失败请到订单详情处理" />
    <NSpin :show="loading">
      <div class="stats-grid">
        <KpiCard label="订单数" :value="orderCountVal" hint="列表接口 total / 当前页推断" />
        <KpiCard label="成功金额" :value="amountSumVal" hint="当前样本中已支付汇总" />
        <KpiCard label="支付成功" :value="successCountVal" />
        <KpiCard label="通知失败" :value="failNotifyVal" hint="样本内支付成功且通知异常" />
      </div>

      <NCard title="最近订单" :bordered="true" class="page-card">
        <div class="table-scroll">
          <NDataTable
            v-if="recent.length"
            :columns="columns"
            :data="recent"
            :bordered="false"
            size="small"
            :row-props="(row) => ({ style: 'cursor:pointer', onClick: () => openOrder(row) })"
          />
          <EmptyState
            v-else-if="!loading"
            title="暂无最近订单"
            description="创建支付订单后将显示在这里"
          />
        </div>
      </NCard>
    </NSpin>
  </div>
</template>
