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

const { Edit, Delete, CommentAdd16Regular, Search, ChevronDown, HistoryClock } = useIcon([
  'Edit',
  'Delete',
  'CommentAdd16Regular',
  'Search',
  'ChevronDown',
  'HistoryClock'
])
</script>

<template>
  <SelectorPopover
    v-model:visible="visible"
    v-model:search-query="searchQuery"
    width="380px"
    position="top"
  >
    <template #trigger>
      <button class="chat-switcher-trigger no-drag" :class="{ active: visible }" type="button" title="聊天列表">
        <HistoryClock />
      </button>
    </template>
    <template #content>
      <div class="chat-switcher-panel">
        <div class="chat-switcher-search-shell">
          <Search class="chat-switcher-search-icon" />
          <input v-model="searchQuery" class="chat-switcher-search-input" placeholder="搜索最近任务" type="text" />
        </div>
        <div class="chat-switcher-toolbar">
          <button class="chat-switcher-filter" type="button">
            <span>聊天列表</span>
            <ChevronDown />
          </button>
          <Button variant="icon" size="sm" title="新建聊天" class="chat-switcher-add-btn" @click.stop="emit('create')">
            <CommentAdd16Regular />
          </Button>
        </div>

        <div v-if="mode === 'create' || mode === 'rename'" class="chat-switcher-inline-card">
          <div class="chat-switcher-inline-title">
            {{ mode === 'create' ? '新建聊天' : '重命名聊天' }}
          </div>
          <input
            v-model="draftTitle"
            class="chat-switcher-input"
            :placeholder="mode === 'create' ? '输入聊天名称' : '输入新的名称'"
            @keydown.enter.stop.prevent="mode === 'create' ? emit('submitCreate') : emit('submitRename')"
          />
          <div class="chat-switcher-inline-actions">
            <Button variant="secondary" size="sm" @click.stop="emit('reset')">取消</Button>
            <Button
              variant="primary"
              size="sm"
              :disabled="mode === 'rename' && !draftTitle.trim()"
              @click.stop="mode === 'create' ? emit('submitCreate') : emit('submitRename')"
            >
              {{ mode === 'create' ? '创建' : '保存' }}
            </Button>
          </div>
        </div>

        <div v-else-if="mode === 'delete' && props.targetChat" class="chat-switcher-inline-card danger">
          <div class="chat-switcher-inline-title">删除聊天</div>
          <div class="chat-switcher-delete-text">确定删除“{{ props.targetChat.title }}”吗？</div>
          <div class="chat-switcher-inline-actions">
            <Button variant="secondary" size="sm" @click.stop="emit('reset')">取消</Button>
            <Button variant="primary" size="sm" danger @click.stop="emit('submitDelete')">删除</Button>
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
              <Button variant="icon" size="sm" title="重命名" @click.stop="emit('rename', chat)">
                <Edit />
              </Button>
              <Button variant="icon" size="sm" danger title="删除" @click.stop="emit('delete', chat)">
                <Delete />
              </Button>
            </div>
          </div>
          <div v-if="!props.filteredChats.length" class="chat-switcher-empty">没找到匹配的聊天</div>
        </div>
      </div>
    </template>
  </SelectorPopover>
</template>

<style scoped>
@import './chat-switcher.css';
</style>
