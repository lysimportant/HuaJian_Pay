<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { fetchAlipayChannel, updateAlipayChannel } from '../api/admin'

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const ok = ref('')
const mode = ref('')
const enabled = ref(true)
const hasPrivateKey = ref(false)
const hasPublicKey = ref(false)
const privateKeyHint = ref('')
const publicKeyHint = ref('')

const form = reactive({
  app_id: '',
  private_key: '',
  public_key: '',
  notify_url: '',
  return_url: '',
  settle_account_label: '',
})

/** Empty secret fields mean "keep existing"; non-empty means replace. */
const secretHint = computed(() => {
  const parts: string[] = []
  if (hasPrivateKey.value) {
    parts.push(
      privateKeyHint.value
        ? `应用私钥已配置（${privateKeyHint.value}），留空则保留`
        : '应用私钥已配置，留空则保留',
    )
  } else {
    parts.push('应用私钥未配置，请填写完整私钥')
  }
  if (hasPublicKey.value) {
    parts.push(
      publicKeyHint.value
        ? `支付宝公钥已配置（${publicKeyHint.value}），留空则保留`
        : '支付宝公钥已配置，留空则保留',
    )
  } else {
    parts.push('支付宝公钥未配置，请填写完整公钥')
  }
  return parts.join('；')
})

function applyConfigPayload(data: any) {
  mode.value = data.mode || ''
  enabled.value = data.enabled !== false
  const c = data.config || {}
  form.app_id = c.app_id || ''
  // Never put secrets or masks into editable fields — always start empty for preserve semantics.
  form.private_key = ''
  form.public_key = ''
  form.notify_url = c.notify_url || ''
  form.return_url = c.return_url || ''
  form.settle_account_label = c.settle_account_label || ''
  hasPrivateKey.value = Boolean(c.has_private_key)
  hasPublicKey.value = Boolean(c.has_public_key)
  privateKeyHint.value = c.private_key_hint || ''
  publicKeyHint.value = c.public_key_hint || ''
}

async function load() {
  loading.value = true
  error.value = ''
  ok.value = ''
  try {
    const data = await fetchAlipayChannel()
    applyConfigPayload(data)
  } catch (e: any) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  error.value = ''
  ok.value = ''
  try {
    // Omit empty secrets so server preserves stored keys; send only replacements.
    const body: Record<string, unknown> = {
      enabled: enabled.value,
      app_id: form.app_id,
      notify_url: form.notify_url,
      return_url: form.return_url,
      settle_account_label: form.settle_account_label,
    }
    const pk = form.private_key.trim()
    const pub = form.public_key.trim()
    if (pk) body.private_key = pk
    if (pub) body.public_key = pub

    const data = await updateAlipayChannel(body)
    ok.value = '已保存'
    if (data?.config) {
      applyConfigPayload(data)
    } else {
      await load()
    }
  } catch (e: any) {
    error.value = e?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>支付宝通道</h1>
        <p class="muted">配置支付宝应用参数。密钥字段留空表示保留原值，填写则替换。</p>
      </div>
      <span class="chip" :class="mode === 'mock' ? 'warn' : 'ok'">CHANNEL_MODE={{ mode || '—' }}</span>
    </header>

    <div v-if="loading" class="card soft">加载中…</div>
    <form v-else class="card form" @submit.prevent="save">
      <p v-if="error" class="err">{{ error }}</p>
      <p v-if="ok" class="ok-msg">{{ ok }}</p>
      <p class="secret-banner">{{ secretHint }}</p>

      <label class="check">
        <input v-model="enabled" type="checkbox" />
        启用该通道配置
      </label>

      <label>
        App ID
        <input v-model="form.app_id" autocomplete="off" />
      </label>

      <label>
        应用私钥
        <span class="field-meta">
          <span v-if="hasPrivateKey" class="badge ok">已配置</span>
          <span v-else class="badge warn">未配置</span>
          <span v-if="privateKeyHint" class="hint-code">{{ privateKeyHint }}</span>
        </span>
        <textarea
          v-model="form.private_key"
          rows="4"
          placeholder="留空保留已有私钥；粘贴完整私钥以替换"
          autocomplete="off"
          spellcheck="false"
        />
      </label>

      <label>
        支付宝公钥
        <span class="field-meta">
          <span v-if="hasPublicKey" class="badge ok">已配置</span>
          <span v-else class="badge warn">未配置</span>
          <span v-if="publicKeyHint" class="hint-code">{{ publicKeyHint }}</span>
        </span>
        <textarea
          v-model="form.public_key"
          rows="4"
          placeholder="留空保留已有公钥；粘贴完整公钥以替换"
          autocomplete="off"
          spellcheck="false"
        />
      </label>

      <label>
        异步通知 URL
        <input v-model="form.notify_url" />
      </label>
      <label>
        同步跳转 URL
        <input v-model="form.return_url" />
      </label>
      <label>
        结算账户备注
        <input v-model="form.settle_account_label" placeholder="仅后台展示" />
      </label>

      <div class="actions">
        <button class="btn primary" type="submit" :disabled="saving">
          {{ saving ? '保存中…' : '保存配置' }}
        </button>
        <button class="btn ghost" type="button" :disabled="saving" @click="load">重新加载</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: 1rem;
}
.page-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}
.page-head h1 {
  margin: 0 0 0.35rem;
  font-size: 1.35rem;
}
.muted {
  margin: 0;
  color: var(--text-muted, #64748b);
  font-size: 0.9rem;
}
.chip {
  font-size: 0.75rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--border, #e2e8f0);
  white-space: nowrap;
}
.chip.warn {
  background: #fff7ed;
  color: #c2410c;
}
.chip.ok {
  background: #ecfdf5;
  color: #047857;
}
.card {
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 1.1rem 1.2rem;
}
.card.soft {
  color: var(--text-muted, #64748b);
}
.form {
  display: grid;
  gap: 0.85rem;
  max-width: 40rem;
}
.form label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text, #0f172a);
}
.form input,
.form textarea {
  font: inherit;
  font-weight: 400;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--bg, #fff);
}
.form textarea {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.8rem;
}
.check {
  display: flex !important;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500 !important;
}
.field-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  font-weight: 500;
}
.badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
}
.badge.ok {
  background: #ecfdf5;
  color: #047857;
}
.badge.warn {
  background: #fff7ed;
  color: #c2410c;
}
.hint-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.75rem;
  color: var(--text-muted, #64748b);
}
.secret-banner {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px dashed var(--border, #e2e8f0);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-muted, #64748b);
}
.actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 0.25rem;
}
.btn {
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  padding: 0.5rem 0.9rem;
  font: inherit;
  cursor: pointer;
  background: #fff;
}
.btn.primary {
  background: var(--primary, #0f766e);
  border-color: transparent;
  color: #fff;
}
.btn.ghost {
  background: transparent;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.err {
  margin: 0;
  color: #b91c1c;
  font-size: 0.9rem;
}
.ok-msg {
  margin: 0;
  color: #047857;
  font-size: 0.9rem;
}
</style>
