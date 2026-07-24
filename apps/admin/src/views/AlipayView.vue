<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NButton, NCard, NForm, NFormItem, NInput, NSwitch, useMessage } from 'naive-ui'
import { fetchAlipayChannel, updateAlipayChannel } from '../api/admin'
import { pickMsg } from '../utils/format'
import PageHeader from '../components/PageHeader.vue'

const message = useMessage()
const loading = ref(false)
const saving = ref(false)
const form = ref({
  enabled: true,
  app_id: '',
  private_key: '',
  alipay_public_key: '',
  notify_url: '',
  return_url: '',
})

async function load() {
  loading.value = true
  try {
    const res: any = await fetchAlipayChannel()
    const data = res?.data || res || {}
    form.value = {
      enabled: data.enabled !== false,
      app_id: data.app_id || '',
      private_key: data.private_key || '',
      alipay_public_key: data.alipay_public_key || '',
      notify_url: data.notify_url || '',
      return_url: data.return_url || '',
    }
  } catch (e: any) {
    message.error(pickMsg(e, '支付宝配置加载失败'))
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await updateAlipayChannel({ ...form.value })
    message.success('支付宝配置已保存')
    await load()
  } catch (e: any) {
    message.error(pickMsg(e, '保存失败'))
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader title="支付宝配置" description="配置支付宝收款通道与回调地址">
      <template #extra>
        <NButton type="primary" :loading="saving" @click="save">保存配置</NButton>
      </template>
    </PageHeader>
    <NCard :bordered="true" class="page-card" :loading="loading">
      <NForm label-placement="left" label-width="140" class="alipay-form">
        <NFormItem label="启用通道">
          <NSwitch v-model:value="form.enabled" />
        </NFormItem>
        <NFormItem label="App ID">
          <NInput v-model:value="form.app_id" placeholder="支付宝应用 AppId" />
        </NFormItem>
        <NFormItem label="应用私钥">
          <NInput
            v-model:value="form.private_key"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 8 }"
            placeholder="RSA2 应用私钥"
          />
        </NFormItem>
        <NFormItem label="支付宝公钥">
          <NInput
            v-model:value="form.alipay_public_key"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 8 }"
            placeholder="支付宝公钥"
          />
        </NFormItem>
        <NFormItem label="异步通知 URL">
          <NInput v-model:value="form.notify_url" placeholder="https://your.domain/notify/alipay" />
        </NFormItem>
        <NFormItem label="同步跳转 URL">
          <NInput v-model:value="form.return_url" placeholder="https://your.domain/return" />
        </NFormItem>
      </NForm>
    </NCard>
  </div>
</template>

<style scoped>
.alipay-form {
  max-width: 720px;
}

@media (max-width: 640px) {
  .alipay-form :deep(.n-form-item) {
    grid-template-columns: 1fr;
  }
}
</style>
