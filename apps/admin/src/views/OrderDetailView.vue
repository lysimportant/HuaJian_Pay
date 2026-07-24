<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NPopconfirm,
  NSpace,
  NSpin,
  useMessage,
} from 'naive-ui'
import { fetchOrder, resendOrderNotify } from '../api/admin'
import { formatTime, money, pickMsg } from '../utils/format'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const loading = ref(false)
const resendLoading = ref(false)
const order = ref<Record<string, unknown> | null>(null)

const text = {
  title: '\u8ba2\u5355\u8be6\u60c5',
  back: '\u8fd4\u56de\u5217\u8868',
  resend: '\u91cd\u53d1\u901a\u77e5',
  confirmResend: '\u786e\u8ba4\u91cd\u53d1',
  cancel: '\u53d6\u6d88',
  confirmBody: '\u786e\u8ba4\u7acb\u5373\u91cd\u53d1\u8be5\u8ba2\u5355\u7684\u5546\u6237\u5f02\u6b65\u901a\u77e5\uff1f',
  loadFailed: '\u8ba2\u5355\u8be6\u60c5\u52a0\u8f7d\u5931\u8d25',
  resendSuccess: '\u901a\u77e5\u53d1\u9001\u6210\u529f',
  resendAttempted: '\u5df2\u53d1\u9001\u901a\u77e5\uff0c\u5546\u6237\u672a\u8fd4\u56de success',
  resendFailed: '\u91cd\u53d1\u901a\u77e5\u5931\u8d25',
  tradeNo: '\u5e73\u53f0\u8ba2\u5355\u53f7',
  outTradeNo: '\u5546\u6237\u8ba2\u5355\u53f7',
  merchantPid: '\u5546\u6237 PID',
  amount: '\u91d1\u989d',
  payStatus: '\u652f\u4ed8\u72b6\u6001',
  notifyStatus: '\u901a\u77e5\u72b6\u6001',
  channel: '\u652f\u4ed8\u65b9\u5f0f',
  name: '\u5546\u54c1\u540d\u79f0',
  createdAt: '\u521b\u5efa\u65f6\u95f4',
  paidAt: '\u652f\u4ed8\u65f6\u95f4',
  notifyCount: '\u901a\u77e5\u6b21\u6570',
  buyer: '\u4e70\u5bb6',
}

async function load() {
  loading.value = true
  try {
    const tradeNo = String(route.params.tradeNo || '')
    const res: any = await fetchOrder(tradeNo)
    order.value = (res?.order || res?.data || res) as Record<string, unknown>
  } catch (e: any) {
    message.error(pickMsg(e, text.loadFailed))
  } finally {
    loading.value = false
  }
}

async function resendNotify() {
  const tradeNo = String(order.value?.trade_no || route.params.tradeNo || '')
  if (!tradeNo) return

  resendLoading.value = true
  try {
    const res: any = await resendOrderNotify(tradeNo)
    if (res?.attempt?.success) {
      message.success(text.resendSuccess)
    } else {
      message.warning(text.resendAttempted)
    }
    await load()
  } catch (e: any) {
    message.error(pickMsg(e, text.resendFailed))
  } finally {
    resendLoading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader :title="text.title" :description="String(route.params.tradeNo || '')">
      <template #extra>
        <NSpace>
          <NPopconfirm
            :positive-text="text.confirmResend"
            :negative-text="text.cancel"
            :disabled="order?.status !== 'paid' || resendLoading"
            @positive-click="resendNotify"
          >
            <template #trigger>
              <NButton
                type="primary"
                secondary
                :loading="resendLoading"
                :disabled="order?.status !== 'paid'"
              >
                {{ text.resend }}
              </NButton>
            </template>
            {{ text.confirmBody }}
          </NPopconfirm>
          <NButton @click="router.push({ name: 'orders' })">{{ text.back }}</NButton>
        </NSpace>
      </template>
    </PageHeader>
    <NSpin :show="loading">
      <NCard :bordered="true" class="page-card">
        <template v-if="order">
          <NDescriptions label-placement="left" :column="2" bordered>
            <NDescriptionsItem :label="text.tradeNo">
              <span class="mono">{{ order.trade_no }}</span>
            </NDescriptionsItem>
            <NDescriptionsItem :label="text.outTradeNo">
              <span class="mono">{{ order.out_trade_no }}</span>
            </NDescriptionsItem>
            <NDescriptionsItem :label="text.merchantPid">{{ order.pid }}</NDescriptionsItem>
            <NDescriptionsItem :label="text.amount">
              <span class="amount">{{ money(order.money) }}</span>
            </NDescriptionsItem>
            <NDescriptionsItem :label="text.payStatus">
              <StatusTag :status="(order.status as string)" />
            </NDescriptionsItem>
            <NDescriptionsItem :label="text.notifyStatus">
              <StatusTag :status="(order.notify_status as string)" />
            </NDescriptionsItem>
            <NDescriptionsItem :label="text.channel">{{ order.type || '-' }}</NDescriptionsItem>
            <NDescriptionsItem :label="text.name">{{ order.name || '-' }}</NDescriptionsItem>
            <NDescriptionsItem :label="text.createdAt">
              {{ formatTime(order.addtime || order.created_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="text.paidAt">
              {{ formatTime(order.endtime || order.paid_at) }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="text.notifyCount">
              {{ order.notify_count ?? 0 }}
            </NDescriptionsItem>
            <NDescriptionsItem :label="text.buyer">{{ order.buyer || '-' }}</NDescriptionsItem>
          </NDescriptions>
        </template>
      </NCard>
    </NSpin>
  </div>
</template>
