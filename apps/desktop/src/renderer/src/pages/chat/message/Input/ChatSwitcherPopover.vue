<script setup lang="ts">
const props = defineProps<{
  activeChatId?: string
  filteredChats: Chat[]
  targetChat: Chat | null
  isChatGenerating: (chat: Chat) => boolean
  getChatSecondaryText: (chat: Chat) => string
}>()

const visible = defineModel<boolean>('visible', { required: true })
const searchQuery = defineModel<string>('searchQuery', { required: true })
const mode = defineModel<'list' | 'create' | 'rename' | 'delete'>('mode', { required: true })
const draftTitle = defineModel<string>('draftTitle', { required: true })

const emit = defineEmits<{
  create: []
  rename: [chat: Chat]
  delete: [chat: Chat]
  reset: []
  submitCreate: []
  submitRename: []
  submitDelete: []
  select: [chatId: string]
}>()

const { Delete, Plus, ChevronDown, HistoryClock } = useIcon([
  'Delete',
  'Plus',
  'ChevronDown',
  'HistoryClock'
])

const handleDelete = async (chat: Chat) => {
  if (
    await useModal().confirm({
      title: '删除会话',
      content: '确定要删除这个聊天吗？',
      confirmProps: {
        danger: true
      }
    })
  ) {
    emit('delete', chat)
    emit('submitDelete')
  }
}
</script>

<template>
  <SelectorPopover
    v-model:visible="visible"
    v-model:search-query="searchQuery"
    width="380px"
    position="top"
    desktop-presentation="tray"
    tray-anchor=".input-container"
    title="聊天列表"
    :has-results="true"
    placeholder="搜索最近任务"
  >
    <template #trigger>
      <button class="chat-switcher-trigger no-drag" :class="{ active: visible }" type="button" title="聊天列表">
        <HistoryClock />
      </button>
    </template>

    <template #search-action>
      <Button variant="icon" size="sm" title="新建聊天" @click.stop="emit('submitCreate')">
        <Plus />
      </Button>
    </template>

    <div v-if="mode === 'rename'" class="chat-switcher-inline-card">
      <div class="chat-switcher-inline-title">重命名聊天</div>
      <input
        v-model="draftTitle"
        class="chat-switcher-input"
        placeholder="输入新的名称"
        @keydown.enter.stop.prevent="emit('submitRename')"
      />
      <div class="chat-switcher-inline-actions">
        <Button variant="secondary" size="sm" @click.stop="emit('reset')">取消</Button>
        <Button
          variant="primary"
          size="sm"
          :disabled="!draftTitle.trim()"
          @click.stop="emit('submitRename')"
        >
          保存
        </Button>
      </div>
    </div>

    <div class="chat-switcher-list">
      <div
        v-for="chat in props.filteredChats"
        :key="chat.id"
        class="chat-switcher-item"
        :class="{ active: props.activeChatId === chat.id }"
        tabindex="0"
        role="button"
        @click="emit('select', chat.id)"
        @keydown.enter.prevent="emit('select', chat.id)"
      >
        <div class="chat-switcher-item-main">
          <div class="chat-switcher-item-top">
            <span class="chat-switcher-item-title">{{ chat.title }}</span>
          </div>
          <div
            v-if="props.getChatSecondaryText(chat) || chat.parentChatId || props.isChatGenerating(chat)"
            class="chat-switcher-item-bottom"
          >
            <span v-if="props.getChatSecondaryText(chat)" class="chat-switcher-item-subtitle">
              {{ props.getChatSecondaryText(chat) }}
            </span>
            <span v-if="chat.parentChatId" class="chat-switcher-badge">子会话</span>
            <span v-if="props.isChatGenerating(chat)" class="chat-switcher-badge generating">生成中</span>
          </div>
        </div>
        <div class="chat-switcher-item-actions" @click.stop>
          <Button variant="icon" size="sm" danger title="删除" @click.stop="handleDelete(chat)">
            <Delete />
          </Button>
        </div>
      </div>
      <div v-if="!props.filteredChats.length" class="chat-switcher-empty">没找到匹配的聊天</div>
    </div>
  </SelectorPopover>
</template>

<style scoped>
</style>
<style>
@import './chat-switcher.css';
</style>
