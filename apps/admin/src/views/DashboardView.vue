<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NButton, NCard, NStatistic, useMessage } from 'naive-ui'
import { fetchOrders, fetchMerchants } from '../api/admin'
import { pickMsg } from '../api/client'
import { money } from '../utils/format'

const message = useMessage()
const loading = ref(false)
const summary = ref({
  todayAmount: 0,
  todayOrders: 0,
  successRate: 0,
  activeMerchants: 0,
})

async function load() {
  loading.value = true
  try {
    const [ordersRes, merchantsRes]: any[] = await Promise.all([
      fetchOrders({ page: 1, page_size: 100 }),
      fetchMerchants(),
    ])
    const items = ordersRes?.data?.items || ordersRes?.items || []
    const total = Number(ordersRes?.data?.total || ordersRes?.total || items.length || 0)
    const paid = items.filter((x: any) => String(x.status).toLowerCase() === 'paid')
    const amount = paid.reduce((s: number, x: any) => s + Number(x.money || 0), 0)
    const merchants = merchantsRes?.data || merchantsRes || []
    summary.value = {
      todayAmount: amount,
      todayOrders: total,
      successRate: total ? Math.round((paid.length / Math.max(items.length, 1)) * 100) : 0,
      activeMerchants: Array.isArray(merchants) ? merchants.length : 0,
    }
  } catch (e: any) {
    message.error(pickMsg(e, '概览加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="hero">
    <div>
      <h1>今日经营概览</h1>
      <p>实时掌握平台关键经营指标</p>
    </div>
    <n-button :loading="loading" @click="load">刷新数据</n-button>
  </div>
  <div class="stats">
    <n-card>
      <n-statistic label="今日交易金额" :value="money(summary.todayAmount)" />
      <small>已支付订单汇总</small>
    </n-card>
    <n-card>
      <n-statistic label="今日订单" :value="summary.todayOrders" />
      <small>全部支付订单</small>
    </n-card>
    <n-card>
      <n-statistic label="成功率" :value="`${summary.successRate}%`" />
      <small>支付成功占比</small>
    </n-card>
    <n-card>
      <n-statistic label="活跃商户" :value="summary.activeMerchants" />
      <small>正常运营商户</small>
    </n-card>
  </div>
  <n-card title="运营提示" class="section">
    <p>订单、商户与支付宝通道状态均可在左侧导航中集中管理。</p>
  </n-card>
</template>
