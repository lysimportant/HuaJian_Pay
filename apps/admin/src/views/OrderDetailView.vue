<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard, NDescriptions, NDescriptionsItem, useMessage } from 'naive-ui'
import { fetchOrder } from '../api/admin'
import { formatTime, money, pickMsg } from '../utils/format'
import PageHeader from '../components/PageHeader.vue'
import StatusTag from '../components/StatusTag.vue'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const loading = ref(false)
const order = ref<Record<string, unknown> | null>(null)

async function load() {
  loading.value = true
  try {
    const tradeNo = String(route.params.tradeNo || '')
    const res: any = await fetchOrder(tradeNo)
    order.value = (res?.data || res) as Record<string, unknown>
  } catch (e: any) {
    message.error(pickMsg(e, '订单详情加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader :title="'订单详情'" :description="String(route.params.tradeNo || '')">
      <template #extra>
        <NButton @click="router.push({ name: 'orders' })">返回列表</NButton>
      </template>
    </PageHeader>
    <NCard :bordered="true" class="page-card" :loading="loading">
      <template v-if="order">
        <NDescriptions label-placement="left" :column="2" bordered>
          <NDescriptionsItem label="平台订单号">
            <span class="mono">{{ order.trade_no }}</span>
          </NDescriptionsItem>
          <NDescriptionsItem label="商户订单号">
            <span class="mono">{{ order.out_trade_no }}</span>
          </NDescriptionsItem>
          <NDescriptionsItem label="商户 PID">{{ order.pid }}</NDescriptionsItem>
          <NDescriptionsItem label="金额">
            <span class="amount">{{ money(order.money) }}</span>
          </NDescriptionsItem>
          <NDescriptionsItem label="支付状态">
            <StatusTag :status="order.status as string" />
          </NDescriptionsItem>
          <NDescriptionsItem label="通知状态">
            <StatusTag :status="order.notify_status as string" />
          </NDescriptionsItem>
          <NDescriptionsItem label="支付方式">{{ order.type || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="商品名称">{{ order.name || '-' }}</NDescriptionsItem>
          <NDescriptionsItem label="创建时间">{{ formatTime(order.addtime || order.created_at) }}</NDescriptionsItem>
          <NDescriptionsItem label="支付时间">{{ formatTime(order.endtime || order.paid_at) }}</NDescriptionsItem>
          <NDescriptionsItem label="通知次数">{{ order.notify_count ?? 0 }}</NDescriptionsItem>
          <NDescriptionsItem label="买家">{{ order.buyer || '-' }}</NDescriptionsItem>
        </NDescriptions>
      </template>
    </NCard>
  </div>
</template>
