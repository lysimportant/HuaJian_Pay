<script setup lang="ts">
import { h, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NCard,
  NDataTable,
  NInput,
  NSelect,
  NSpace,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { fetchOrders } from '../api/admin'
import { formatTime, money, pickMsg } from '../utils/format'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'
import EmptyState from '../components/EmptyState.vue'

const message = useMessage()
const router = useRouter()
const loading = ref(false)
const rows = ref<Record<string, unknown>[]>([])
const total = ref(0)
const query = reactive({
  page: 1,
  page_size: 20,
  status: null as string | null,
  keyword: '',
})

const statusOptions = [
  { label: '全部状态', value: null as unknown as string },
  { label: '待支付', value: 'pending' },
  { label: '已支付', value: 'paid' },
  { label: '已失败', value: 'failed' },
  { label: '已关闭', value: 'closed' },
  { label: '已过期', value: 'expired' },
]

const columns: DataTableColumns<Record<string, unknown>> = [
  {
    title: '平台订单号',
    key: 'trade_no',
    minWidth: 180,
    ellipsis: { tooltip: true },
    render: (r) => h('span', { class: 'mono' }, String(r.trade_no ?? r.order_no ?? '-')),
  },
  {
    title: '商户订单号',
    key: 'out_trade_no',
    minWidth: 160,
    ellipsis: { tooltip: true },
    render: (r) => h('span', { class: 'mono' }, String(r.out_trade_no ?? '-')),
  },
  {
    title: '金额',
    key: 'money',
    width: 110,
    render: (r) => h('span', { class: 'amount' }, money(r.money)),
  },
  {
    title: '支付状态',
    key: 'status',
    width: 110,
    render: (r) => h(StatusTag, { status: r.status as string | number }),
  },
  {
    title: '通知状态',
    key: 'notify_status',
    width: 110,
    render: (r) => h(StatusTag, { status: r.notify_status as string | number }),
  },
  {
    title: '通道',
    key: 'type',
    width: 100,
    render: (r) => String(r.type ?? r.channel ?? 'alipay'),
  },
  {
    title: '创建时间',
    key: 'created_at',
    width: 170,
    render: (r) => formatTime(r.created_at),
  },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    fixed: 'right',
    render: (r) =>
      h(
        NButton,
        {
          text: true,
          type: 'primary',
          onClick: (e: MouseEvent) => {
            e.stopPropagation()
            openDetail(r)
          },
        },
        { default: () => '详情' },
      ),
  },
]

async function load() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      page: query.page,
      page_size: query.page_size,
    }
    if (query.status) params.status = query.status
    if (query.keyword) {
      params.keyword = query.keyword
      params.trade_no = query.keyword
      params.out_trade_no = query.keyword
    }
    const data = await fetchOrders(params)
    rows.value = (data?.list || data?.items || data?.orders || data?.data || []) as Record<
      string,
      unknown
    >[]
    total.value = Number(data?.total ?? rows.value.length)
  } catch (e) {
    message.error(pickMsg(e, '加载订单失败'))
  } finally {
    loading.value = false
  }
}

function openDetail(row: Record<string, unknown>) {
  const id = row.trade_no || row.order_no
  if (id) router.push(`/orders/${id}`)
}

function onPageChange(page: number) {
  query.page = page
  load()
}

function search() {
  query.page = 1
  load()
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader title="订单" description="查询支付与通知状态，定位失败通知并进入详情处理" />

    <NCard :bordered="true" class="page-card">
      <div class="toolbar">
        <NSelect
          v-model:value="query.status"
          :options="statusOptions"
          placeholder="支付状态"
          clearable
          style="width: 160px"
          @update:value="search"
        />
        <NInput
          v-model:value="query.keyword"
          clearable
          placeholder="订单号 / 商户订单号"
          style="max-width: 280px"
          @keyup.enter="search"
        />
        <NSpace>
          <NButton type="primary" :loading="loading" @click="search">查询</NButton>
          <NButton
            quaternary
            @click="
              query.keyword = '';
              query.status = null;
              search();
            "
          >
            重置
          </NButton>
        </NSpace>
      </div>

      <div class="table-scroll">
        <NDataTable
          v-if="rows.length || loading"
          :loading="loading"
          :columns="columns"
          :data="rows"
          :bordered="false"
          :row-key="(r) => String(r.trade_no ?? r.order_no ?? Math.random())"
          :pagination="{
            page: query.page,
            pageSize: query.page_size,
            itemCount: total,
            onChange: onPageChange,
          }"
          :row-props="(row) => ({ style: 'cursor:pointer', onClick: () => openDetail(row) })"
        />
        <EmptyState
          v-else
          title="暂无订单"
          description="调整筛选条件，或等待商户通过 API 创建订单"
        >
          <template #action>
            <NButton type="primary" secondary @click="search">刷新</NButton>
          </template>
        </EmptyState>
      </div>
    </NCard>
  </div>
</template>
