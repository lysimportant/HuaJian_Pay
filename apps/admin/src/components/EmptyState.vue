<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
  }>(),
  {
    title: '暂无数据',
    description: '当前条件下没有可展示的内容',
  },
)
</script>

<template>
  <div class="empty-state" role="status">
    <div class="empty-state__icon" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M4 7h16M4 12h10M4 17h7" stroke-linecap="round" />
      </svg>
    </div>
    <p class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>
    <div v-if="$slots.action" style="margin-top: 12px">
      <slot name="action" />
    </div>
  </div>
</template>
