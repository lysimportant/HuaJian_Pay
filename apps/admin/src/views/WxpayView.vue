<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NSpace,
  NSwitch,
  NTag,
  NText,
  NAlert,
  NSpin,
  useMessage,
} from 'naive-ui'
import { fetchWxpayChannel, updateWxpayChannel } from '../api/admin'
import PageHeader from '../components/PageHeader.vue'

const message = useMessage()
const loading = ref(false)
const saving = ref(false)
const mode = ref('')
const enabled = ref(true)

const form = reactive({
  mch_id: '',
  app_id: '',
  serial_no: '',
  notify_url: '',
  api_v3_key: '',
  private_key: '',
  platform_public_key: '',
})

const meta = reactive({
  has_api_v3_key: false,
  has_private_key: false,
  has_platform_public_key: false,
  api_v3_key_hint: '',
  private_key_hint: '',
  platform_public_key_hint: '',
})

async function load() {
  loading.value = true
  try {
    const res = await fetchWxpayChannel()
    mode.value = res.mode || ''
    enabled.value = res.enabled !== false
    const c = res.config || {}
    form.mch_id = c.mch_id || ''
    form.app_id = c.app_id || ''
    form.serial_no = c.serial_no || ''
    form.notify_url = c.notify_url || ''
    // Never echo secrets into inputs
    form.api_v3_key = ''
    form.private_key = ''
    form.platform_public_key = ''
    meta.has_api_v3_key = Boolean(c.has_api_v3_key)
    meta.has_private_key = Boolean(c.has_private_key)
    meta.has_platform_public_key = Boolean(c.has_platform_public_key)
    meta.api_v3_key_hint = c.api_v3_key_hint || ''
    meta.private_key_hint = c.private_key_hint || ''
    meta.platform_public_key_hint = c.platform_public_key_hint || ''
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const body: Record<string, unknown> = {
      enabled: enabled.value,
      mch_id: form.mch_id,
      app_id: form.app_id,
      serial_no: form.serial_no,
      notify_url: form.notify_url,
    }
    // Empty secret => omit => server keeps existing
    if (form.api_v3_key.trim()) body.api_v3_key = form.api_v3_key.trim()
    if (form.private_key.trim()) body.private_key = form.private_key.trim()
    if (form.platform_public_key.trim()) {
      body.platform_public_key = form.platform_public_key.trim()
    }

    const res = await updateWxpayChannel(body)
    message.success('已保存')
    const c = res.config || {}
    meta.has_api_v3_key = Boolean(c.has_api_v3_key)
    meta.has_private_key = Boolean(c.has_private_key)
    meta.has_platform_public_key = Boolean(c.has_platform_public_key)
    meta.api_v3_key_hint = c.api_v3_key_hint || ''
    meta.private_key_hint = c.private_key_hint || ''
    meta.platform_public_key_hint = c.platform_public_key_hint || ''
    form.api_v3_key = ''
    form.private_key = ''
    form.platform_public_key = ''
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      title="微信支付配置"
      description="微信支付 APIv3 Native（扫码）商户参数。密钥仅可替换，不会回显明文。"
    >
      <template #extra>
        <NSpace>
          <NTag v-if="mode" :type="mode === 'live' ? 'success' : 'warning'" size="small">
            模式 {{ mode }}
          </NTag>
          <NButton secondary @click="load" :loading="loading">刷新</NButton>
          <NButton type="primary" :loading="saving" @click="save">保存</NButton>
        </NSpace>
      </template>
    </PageHeader>

    <NSpin :show="loading">
      <NAlert type="info" class="mb" :bordered="false">
        需使用微信官方商户平台 APIv3 证书与密钥。个人收款码监控不在支持范围。公共支付页对
        <code>wxpay</code> 使用 <code>code_url</code> / <code>qrcode</code> 渲染微信品牌二维码。
      </NAlert>

      <NCard title="通道开关" class="mb" :bordered="false" embedded>
        <NSpace align="center">
          <NText>启用微信支付</NText>
          <NSwitch v-model:value="enabled" />
        </NSpace>
      </NCard>

      <NCard title="商户参数" :bordered="false" embedded>
        <NForm label-placement="left" label-width="150">
          <NFormItem label="商户号 mch_id">
            <NInput v-model:value="form.mch_id" placeholder="微信支付商户号" />
          </NFormItem>
          <NFormItem label="AppID">
            <NInput v-model:value="form.app_id" placeholder="公众号/小程序/应用 AppID" />
          </NFormItem>
          <NFormItem label="证书序列号">
            <NInput v-model:value="form.serial_no" placeholder="商户 API 证书序列号" />
          </NFormItem>
          <NFormItem label="异步通知 URL">
            <NInput
              v-model:value="form.notify_url"
              placeholder="https://your-domain/channels/wxpay/notify"
            />
          </NFormItem>

          <NFormItem label="APIv3 Key">
            <div class="secret-block">
              <NSpace class="mb-sm" align="center">
                <NTag size="small" :type="meta.has_api_v3_key ? 'success' : 'default'">
                  {{ meta.has_api_v3_key ? '已配置' : '未配置' }}
                </NTag>
                <NText v-if="meta.api_v3_key_hint" depth="3" style="font-size: 12px">
                  {{ meta.api_v3_key_hint }}
                </NText>
              </NSpace>
              <NInput
                v-model:value="form.api_v3_key"
                type="password"
                show-password-on="click"
                maxlength="32"
                placeholder="留空保留原值；填写则替换（须 32 位）"
              />
            </div>
          </NFormItem>

          <NFormItem label="商户私钥">
            <div class="secret-block">
              <NSpace class="mb-sm" align="center">
                <NTag size="small" :type="meta.has_private_key ? 'success' : 'default'">
                  {{ meta.has_private_key ? '已配置' : '未配置' }}
                </NTag>
                <NText v-if="meta.private_key_hint" depth="3" style="font-size: 12px">
                  {{ meta.private_key_hint }}
                </NText>
              </NSpace>
              <NInput
                v-model:value="form.private_key"
                type="textarea"
                :rows="4"
                placeholder="留空保留原值；填写 PEM 私钥则替换"
              />
            </div>
          </NFormItem>

          <NFormItem label="平台公钥/证书">
            <div class="secret-block">
              <NSpace class="mb-sm" align="center">
                <NTag
                  size="small"
                  :type="meta.has_platform_public_key ? 'success' : 'default'"
                >
                  {{ meta.has_platform_public_key ? '已配置' : '未配置' }}
                </NTag>
                <NText v-if="meta.platform_public_key_hint" depth="3" style="font-size: 12px">
                  {{ meta.platform_public_key_hint }}
                </NText>
              </NSpace>
              <NInput
                v-model:value="form.platform_public_key"
                type="textarea"
                :rows="4"
                placeholder="留空保留原值；填写微信支付平台公钥/证书 PEM 则替换"
              />
            </div>
          </NFormItem>
        </NForm>
      </NCard>
    </NSpin>
  </div>
</template>

<style scoped>
.mb {
  margin-bottom: 16px;
}
.mb-sm {
  margin-bottom: 8px;
}
.secret-block {
  width: 100%;
}
code {
  font-size: 12px;
  background: var(--hj-bg-app, #f4f6f9);
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
