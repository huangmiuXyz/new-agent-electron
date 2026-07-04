<template>
  <main class="main-chat" :class="{ compact, 'is-empty': isEmpty }">
    <ChatMessageList v-show="!isEmpty" />
    <Transition name="empty-hero">
      <div v-if="isEmpty" class="empty-hero" :class="{ 'is-mobile': isMobile }">
        <div class="empty-hero__brand">
          <span class="brand-mark">agent</span><span class="brand-mark brand-mark--accent">qi</span>
        </div>
        <p class="empty-hero__subtitle">{{ heroSubtitle }}</p>
      </div>
    </Transition>
    <ChatMessageInput />
  </main>
</template>

<script setup lang="ts">
defineProps<{
  compact?: boolean
}>()

const { currentChat } = storeToRefs(useChatsStores())

const isEmpty = computed(() => !currentChat.value?.messages?.length)

const heroSubtitle = computed(
  () => '输入消息开始聊天，或使用 @ 调用技能、文件与智能体'
)
</script>

<style scoped>
.main-chat {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  position: relative;
  padding: 0 12px;
}

.main-chat.compact {
  background: var(--bg-main-surface);
}

.main-chat.compact :deep(.footer) {
  padding: 8px;
}

.main-chat.compact :deep(.action-left) {
  min-width: 0;
  flex: 1;
  flex-wrap: wrap;
  row-gap: 4px;
}

.main-chat.compact :deep(.action-right) {
  flex-shrink: 0;
}

.main-chat.compact :deep(.messages-content.is-centered) {
  max-width: none;
}

.main-chat.compact :deep(.message-item-wrapper) {
  margin-bottom: 6px;
}

/* —— 空消息状态：输入框上移至中部 —— */
.main-chat.is-empty {
  justify-content: center;
  align-items: center;
}

.main-chat.is-empty :deep(.footer) {
  max-width: 760px;
  margin: 0 auto;
  width: 100%;
  transition: none;
}
.main-chat :deep(.footer) {
  transition: none;
}
.empty-hero {
  max-width: 760px;
  width: 100%;
  margin: 0 auto;
  padding: 0 24px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  pointer-events: none;
}

.empty-hero__brand {
  display: inline-flex;
  align-items: baseline;
  margin-bottom: 28px;
  font-family: 'SF Pro Display', -apple-system, 'PingFang SC', system-ui, sans-serif;
}

.brand-mark {
  font-size: 38px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--text-secondary);
}

.brand-mark--accent {
  font-weight: 700;
  background: linear-gradient(120deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 60%, #67e8f9) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.empty-hero__title {
  margin: 0;
  font-size: 24px;
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: -0.01em;
  background: linear-gradient(
    120deg,
    var(--text-primary) 0%,
    color-mix(in srgb, var(--text-primary) 70%, var(--color-primary)) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 10px;
}

.empty-hero__subtitle {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-tertiary);
  letter-spacing: 0.01em;
}

.empty-hero.is-mobile .empty-hero__brand {
  margin-bottom: 22px;
}

.empty-hero.is-mobile .brand-mark {
  font-size: 30px;
}

.empty-hero.is-mobile .empty-hero__title {
  font-size: 20px;
}

.empty-hero.is-mobile .empty-hero__subtitle {
  font-size: 12px;
}

.empty-hero-enter-active {
  transition:
    opacity 0.4s var(--motion-ease-decelerated),
    transform 0.4s var(--motion-ease-decelerated);
}

.empty-hero-leave-active {
  transition:
    opacity 0.22s var(--motion-ease-standard),
    transform 0.22s var(--motion-ease-standard);
}

.empty-hero-enter-from {
  opacity: 0;
  transform: translateY(16px) scale(0.97);
}

.empty-hero-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.99);
}
</style>
