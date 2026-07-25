<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NCard,
  NDataTable,
  NGi,
  NGrid,
  NSpin,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { fetchOrders } from '../api/admin'
import EmptyState from '../components/EmptyState.vue'
import KpiCard from '../components/KpiCard.vue'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'
import { moneyFromCents } from '../utils/format'

const router = useRouter()
const message = useMessage()
const loading = ref(false)
const recent = ref<any[]>([])
const total = ref(0)

const columns: DataTableColumns<any> = [
  { title: '平台单号', key: 'trade_no', ellipsis: { tooltip: true } },
  {
    title: '金额',
    key: 'amount_cents',
    width: 110,
    render: (r) => moneyFromCents(r.amount_cents ?? r.amount),
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: (r) => h(StatusTag, { status: String(r.status ?? '') }),
  },
  {
    title: '创建时间',
    key: 'created_at',
    width: 180,
    render: (r) => formatTime(r.created_at),
  },
]

function formatTime(v: unknown) {
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Date.parse(String(v))
  if (!Number.isFinite(n)) return String(v)
  const d = new Date(n)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const orderCountVal = computed(() => total.value || recent.value.length)
const amountSumVal = computed(() => {
  const sum = recent.value
    .filter((r) => r.status === 'paid' || r.status === 'success')
    .reduce((a, r) => a + Number(r.amount_cents ?? 0), 0)
  return moneyFromCents(sum)
})
const successCountVal = computed(
  () => recent.value.filter((r) => r.status === 'paid' || r.status === 'success').length,
)
const failNotifyVal = computed(
  () =>
    recent.value.filter(
      (r) =>
        (r.status === 'paid' || r.status === 'success') &&
        (r.notify_status === 'failed' || r.notify_status === 'fail'),
    ).length,
)

async function load() {
  loading.value = true
  try {
    const res = await fetchOrders({ page: 1, page_size: 10 })
    recent.value = res.items || res.list || []
    total.value = Number(res.total ?? recent.value.length)
    message.success('概览已刷新')
  } catch (e: any) {
    message.error(e?.message || '加载概览失败')
  } finally {
    loading.value = false
  }
}

function openOrder(row: any) {
  const no = row.trade_no || row.order_no
  if (no) router.push(`/orders/${encodeURIComponent(String(no))}`)
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetchOrders({ page: 1, page_size: 10 })
    recent.value = res.items || res.list || []
    total.value = Number(res.total ?? recent.value.length)
  } catch (e: any) {
    message.error(e?.message || '加载概览失败')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <PageHeader title="数据概览" description="订单与通知关键指标（基于最近样本）">
      <template #extra>
        <NButton secondary :loading="loading" @click="load">刷新</NButton>
      </template>
    </PageHeader>

    <NSpin :show="loading">
      <NGrid cols="1 s:2 m:2 l:4" :x-gap="16" :y-gap="16" responsive="screen" class="kpi-grid">
        <NGi>
          <KpiCard
            label="订单数"
            :value="orderCountVal"
            hint="列表接口 total / 当前页推断"
            tone="info"
          />
        </NGi>
        <NGi>
          <KpiCard
            label="成功金额"
            :value="amountSumVal"
            hint="当前样本中已支付汇总"
            tone="success"
          />
        </NGi>
        <NGi>
          <KpiCard
            label="支付成功"
            :value="successCountVal"
            hint="样本内已支付笔数"
            tone="success"
          />
        </NGi>
        <NGi>
          <KpiCard
            label="通知失败"
            :value="failNotifyVal"
            hint="样本内支付成功且通知异常"
            tone="danger"
          />
        </NGi>
      </NGrid>

      <NCard title="最近订单" :bordered="true" class="page-card recent-card">
        <div class="table-scroll">
          <NDataTable
            v-if="recent.length"
            :columns="columns"
            :data="recent"
            :bordered="false"
            size="small"
            :scroll-x="720"
            :row-props="
              (row) => ({
                style: 'cursor:pointer',
                onClick: () => openOrder(row),
              })
            "
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

<style scoped>
.kpi-grid {
  margin-bottom: 20px;
  width: 100%;
}
.recent-card {
  width: 100%;
}
</style>
