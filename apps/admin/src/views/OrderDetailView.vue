<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard, NDescriptions, NDescriptionsItem, NTag, useMessage } from 'naive-ui'
import { fetchOrder } from '../api/admin'
import { pickMsg } from '../api/client'
import { formatTime, money, statusLabel, statusType } from '../utils/format'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const loading = ref(false)
const order = ref<any>(null)

async function load() {
  loading.value = true
  try {
    const tradeNo = String(route.params.tradeNo || '')
    const res: any = await fetchOrder(tradeNo)
    order.value = res?.data || res
  } catch (e: any) {
    message.error(pickMsg(e, '订单详情加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="hero">
    <div>
      <h1>订单详情</h1>
      <p>{{ route.params.tradeNo }}</p>
    </div>
    <n-button @click="router.push({ name: 'orders' })">返回列表</n-button>
  </div>
  <n-card :bordered="false" :loading="loading">
    <template v-if="order">
      <n-descriptions label-placement="left" :column="2" bordered>
        <n-descriptions-item label="平台订单号">{{ order.trade_no }}</n-descriptions-item>
        <n-descriptions-item label="商户订单号">{{ order.out_trade_no }}</n-descriptions-item>
        <n-descriptions-item label="商户 PID">{{ order.pid }}</n-descriptions-item>
        <n-descriptions-item label="金额">{{ money(order.money) }}</n-descriptions-item>
        <n-descriptions-item label="状态">
          <n-tag :type="statusType(order.status)" size="small" round>{{ statusLabel(order.status) }}</n-tag>
        </n-descriptions-item>
        <n-descriptions-item label="支付方式">{{ order.type || '-' }}</n-descriptions-item>
        <n-descriptions-item label="商品名称">{{ order.name || '-' }}</n-descriptions-item>
        <n-descriptions-item label="创建时间">{{ formatTime(order.addtime) }}</n-descriptions-item>
        <n-descriptions-item label="支付时间">{{ formatTime(order.endtime) }}</n-descriptions-item>
        <n-descriptions-item label="通知状态">{{ order.notify_status ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="通知次数">{{ order.notify_count ?? 0 }}</n-descriptions-item>
        <n-descriptions-item label="买家">{{ order.buyer || '-' }}</n-descriptions-item>
      </n-descriptions>
    </template>
  </n-card>
</template>
