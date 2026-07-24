<script setup lang="ts">
import { NButton, NCard, NForm, NFormItem, NInput, NInputNumber, useMessage } from 'naive-ui'

const message = useMessage()
</script>

<template>
  <n-card title="系统设置" :bordered="false">
    <n-form label-placement="left" label-width="120">
      <n-form-item label="平台名称">
        <n-input value="花间支付" />
      </n-form-item>
      <n-form-item label="通知重试">
        <n-input-number :value="5" />
        <span class="suffix">次</span>
      </n-form-item>
      <n-button type="primary" @click="message.success('设置已保存')">保存设置</n-button>
    </n-form>
  </n-card>
</template>
