<script setup lang="ts">
import { NAlert, NCard, NForm, NFormItem, NInput, NInputNumber } from 'naive-ui'
import PageHeader from '../components/PageHeader.vue'
</script>

<template>
  <div>
    <PageHeader title="系统设置" description="占位页：后端设置 API 就绪前仅展示说明，避免误操作" />
    <NCard :bordered="true" class="page-card">
      <NAlert type="info" title="当前为占位界面" style="margin-bottom: 20px">
        平台名称与通知重试次数尚未接入可写配置接口。下列控件仅示意信息架构，保存不会持久化。
      </NAlert>
      <NForm label-placement="left" label-width="120" style="max-width: 480px">
        <NFormItem label="平台名称">
          <NInput value="花间支付" disabled />
        </NFormItem>
        <NFormItem label="通知重试">
          <NInputNumber :value="5" disabled />
          <span class="muted" style="margin-left: 8px">次（只读示意）</span>
        </NFormItem>
      </NForm>
    </NCard>
  </div>
</template>
