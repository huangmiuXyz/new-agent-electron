<script setup lang="ts">
import { isMobile } from '@renderer/composables/useDeviceType'
const chatsStore = useChatsStores()
const { showContextMenu } = useContextMenu()
const chatsIcon = useIcon('Chat')
const router = useRouter()

const selectChat = (chatId: string) => {
  chatsStore.setActiveChat(chatId)
  if (isMobile.value) {
    router.push('/mobile/chat/session')
  }
}

const createNewChat = () => {
  chatsStore.createChat('新的聊天')
}
const { confirm } = useModal()
const deleteChat = async (chatId: string) => {
  if (
    await confirm({
      title: '删除会话',
      content: '确定要删除这个聊天吗？',
      confirmProps: {
        danger: true
      }
    })
  ) {
    chatsStore.deleteChat(chatId)
  }
}

const renameChat = async (chatId: string) => {
  const chat = chatsStore.chats.find((c) => c.id === chatId)
  if (chat) {
    const [Form, { getFieldValue }] = useForm({
      fields: [
        {
          label: '名称',
          type: 'text',
          name: 'name'
        }
      ],
      initialData: {
        name: chat.title
      }
    })
    if (
      await useModal().confirm({
        title: '重命名对话',
        content: Form
      })
    ) {
      const newName = getFieldValue('name')
      if (newName && newName.trim()) {
        chatsStore.renameChat(chatId, newName.trim())
      }
    }
  }
}
const { Edit, Delete, Search, CommentAdd16Regular } = useIcon(['Edit', 'Delete', 'Plus', 'Search', 'CommentAdd16Regular'])
const showSearch = ref(false)
const openSearch = () => {
  showSearch.value = true
}

const getLastMessage = (chat: Chat) => {
  if (!chat.messages || chat.messages.length === 0) return '开始你的第一次对话吧'
  const lastMsg = chat.messages[chat.messages.length - 1]
  const textContent = lastMsg.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
  return textContent || '[媒体内容]'
}

const getChatAvatar = (title: string) => {
  const firstChar = title.charAt(0).toUpperCase()
  // Morandi Palette for a more sophisticated look
  const colors = [
    { bg: '#E2E8F0', text: '#475569' }, // Slate
    { bg: '#FEE2E2', text: '#991B1B' }, // Red
    { bg: '#FEF3C7', text: '#92400E' }, // Amber
    { bg: '#D1FAE5', text: '#065F46' }, // Emerald
    { bg: '#DBEAFE', text: '#1E40AF' }, // Blue
    { bg: '#F3E8FF', text: '#6B21A8' }  // Purple
  ]
  const charCode = firstChar.charCodeAt(0) || 0
  const theme = colors[charCode % colors.length]
  return { char: firstChar, background: theme?.bg, color: theme?.text }
}

const showChatContextMenu = (event: MouseEvent, chatId: string) => {
  event.preventDefault()
  event.stopPropagation()
  const menuOptions = [
    {
      label: '重命名',
      icon: Edit,
      action: 'rename',
      onClick: () => renameChat(chatId)
    },
    {
      label: '删除',
      icon: Delete,
      action: 'delete',
      danger: true,
      onClick: () => deleteChat(chatId)
    }
  ]
  showContextMenu(event, menuOptions, { chatId })
}
</script>

<template>
  <aside class="sidebar" :class="{ 'is-mobile': isMobile }">
    <div v-if="isMobile" class="mobile-header">
      <div class="mobile-header-top">
        <h1 class="mobile-title">对话</h1>
        <div class="mobile-header-actions">
          <button class="mobile-action-btn" @click="openSearch">
            <Search />
          </button>
          <button class="mobile-action-btn" @click="createNewChat">
            <CommentAdd16Regular />
          </button>
        </div>
      </div>
    </div>

    <div class="nav-list">
      <!-- 空状态显示 -->
      <div v-if="!chatsStore.allChats.length" class="empty-state">
        <!-- Mobile Modern Empty State -->
        <template v-if="isMobile">
          <div class="empty-illustration">
            <div class="chat-bubble-sketch"></div>
          </div>
          <p class="empty-text">这里空空如也</p>
          <button @click="createNewChat" class="modern-btn">
            发起新对话
          </button>
        </template>
        <!-- PC Original Empty State -->
        <template v-else>
          <div class="empty-icon">
            <chatsIcon />
          </div>
          <p class="empty-text">暂无聊天记录</p>
          <Button @click="createNewChat" variant="primary" size="sm" class="empty-button">
            开始新对话
          </Button>
        </template>
      </div>

      <!-- 聊天列表 -->
      <List v-if="chatsStore.allChats.length" :items="chatsStore.allChats" :active-id="chatsStore.activeChatId!"
        :key-field="'id'" :main-field="'title'" :sub-field="'createdAt'" @select="selectChat"
        @contextmenu="showChatContextMenu">
        <template #main="{ item }">
          <!-- Mobile Premium Layout -->
          <div v-if="isMobile" class="chat-row">
            <div class="avatar-container">
              <div class="squircle-avatar"
                :style="{ background: getChatAvatar(item.title).background, color: getChatAvatar(item.title).color }">
                {{ getChatAvatar(item.title).char }}
              </div>
              <div v-if="item.isTemp" class="temp-badge"></div>
            </div>
            <div class="content-container">
              <div class="top-row">
                <span v-if="!chatsStore.isTitleGenerating(item.id)" class="chat-name">{{
                  item.title
                }}</span>
                <div v-else class="shimmer-title"></div>
                <span class="chat-time">{{ formatTime(item.createdAt) }}</span>
              </div>
              <div class="bottom-row">
                <p class="chat-preview-text">{{ getLastMessage(item) }}</p>
              </div>
            </div>
          </div>
          <!-- PC Original Minimalist Layout -->
          <div v-else class="chat-title-container">
            <span v-if="!chatsStore.isTitleGenerating(item.id)" class="chat-title">{{
              item.title
            }}</span>
            <div v-else class="chat-title-loading">
              <div class="loading-spinner-small"></div>
              <span>标题生成中...</span>
            </div>
          </div>
        </template>
        <template #actions="{ item }">
          <span v-if="!isMobile && item.createdAt" class="item-time">{{ formatTime(item.createdAt) }}</span>
        </template>
      </List>
    </div>
    <GlobalSearch v-model="showSearch" />
  </aside>
</template>

<style scoped>
/* --- Mobile Premium Styles --- */
.sidebar.is-mobile {
  background-color: #ffffff;
  border-right: none;
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.mobile-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: saturate(180%) blur(20px);
  padding: calc(16px + env(safe-area-inset-top, 24px)) 16px 8px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
}

.mobile-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
}

.mobile-title {
  font-size: 22px;
  font-weight: 700;
  color: #000;
  letter-spacing: -0.5px;
}

.mobile-header-actions {
  display: flex;
  gap: 16px;
}

.mobile-action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  transition: opacity 0.2s;
}

.mobile-action-btn:active {
  opacity: 0.6;
}

.sidebar.is-mobile .nav-list {
  padding: 0;
  width: 100% !important;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.sidebar.is-mobile :deep(.list-container),
.sidebar.is-mobile :deep(.list-scroll-area) {
  width: 100% !important;
}

.sidebar.is-mobile :deep(.list-item) {
  padding: 0 !important;
  background: transparent !important;
  margin: 0 !important;
  height: auto !important;
  border-radius: 0 !important;
  width: 100% !important;
  display: block !important;
  /* Change to block to avoid flex interference */
}

.sidebar.is-mobile :deep(.item-content) {
  width: 100% !important;
  max-width: none !important;
  flex: none !important;
}

.sidebar.is-mobile :deep(.item-actions),
.sidebar.is-mobile :deep(.item-media) {
  display: none !important;
}

/* Chat Row Design */
.chat-row {
  display: flex;
  width: 100%;
  padding: 12px 16px;
  gap: 12px;
  position: relative;
  background: #ffffff;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

.chat-row::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: 0;
  left: 72px;
  /* avatar width + gap + padding */
  height: 0.5px;
  background-color: rgba(0, 0, 0, 0.05);
  transition: opacity 0.2s;
}

.chat-row::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: 0;
  left: 72px;
  /* avatar width + gap + padding */
  height: 0.5px;
  background-color: rgba(0, 0, 0, 0.05);
  transition: opacity 0.2s;
}

.chat-row:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.chat-row:active {
  background-color: rgba(0, 0, 0, 0.05);
  transform: scale(0.985);
}

.avatar-container {
  position: relative;
  flex-shrink: 0;
}

.squircle-avatar {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  /* Squircle shortcut */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.05);
}

.temp-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #34C759;
  /* iOS Green */
  border: 2px solid #fff;
}

.content-container {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.top-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.chat-name {
  font-size: 16px;
  font-weight: 600;
  color: #000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-time {
  font-size: 13px;
  color: #8E8E93;
}

.chat-preview-text {
  font-size: 14px;
  color: #8E8E93;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Empty State Modern */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 40px;
  text-align: center;
}

.empty-illustration {
  width: 120px;
  height: 120px;
  background: #f2f2f7;
  border-radius: 20px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-bubble-sketch {
  width: 40px;
  height: 40px;
  border: 3px solid #D1D1D6;
  border-radius: 12px;
  position: relative;
}

.chat-bubble-sketch::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 10px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid #D1D1D6;
}

.empty-text {
  font-size: 16px;
  font-weight: 500;
  color: #8E8E93;
  margin-bottom: 24px;
}

.modern-btn {
  background: #007AFF;
  color: #fff;
  border: none;
  padding: 12px 24px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 15px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.modern-btn:hover {
  background: #0063CC;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
}

.modern-btn:active {
  transform: scale(0.96);
}

/* Shimmer Loading */
.shimmer-title {
  width: 100px;
  height: 14px;
  background: #f2f2f7;
  border-radius: 4px;
  animation: shimmer 1.5s infinite linear;
}

@keyframes shimmer {
  0% {
    opacity: 0.5;
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 0.5;
  }
}

/* Original styles for PC */
.sidebar:not(.is-mobile) {
  background-color: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  user-select: none;
  height: 100%;
}

.sidebar:not(.is-mobile) .nav-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

/* 调整List组件的样式以匹配原有样式 */
.sidebar:not(.is-mobile) :deep(.mode-gap) {
  width: 100%;
  padding: 0;
  border-right: none;
  /* 设置自定义的选中项背景颜色 */
  --bg-active: #e4e4e6;
}

.sidebar:not(.is-mobile) :deep(.list-scroll-area) {
  padding: 0;
}

.sidebar:not(.is-mobile) :deep(.list-item) {
  height: 40px;
  margin-bottom: 2px;
  padding: 8px;
  border-radius: var(--radius-sm);
  transition: background-color 0.2s;
  background-color: transparent;
}

.sidebar:not(.is-mobile) :deep(.list-item:hover) {
  background-color: var(--bg-hover);
}

.sidebar:not(.is-mobile) :deep(.list-item.is-active) {
  background-color: var(--bg-active, #e4e4e6) !important;
}

.sidebar:not(.is-mobile) :deep(.main-text) {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
}

.sidebar:not(.is-mobile) :deep(.item-time) {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 500;
}

/* 空状态样式 */
.sidebar:not(.is-mobile) .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--text-tertiary);
}

.sidebar:not(.is-mobile) .empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.sidebar:not(.is-mobile) .empty-text {
  margin-bottom: 16px;
  font-size: 14px;
}

.sidebar:not(.is-mobile) .empty-button {
  margin-top: 8px;
}
</style>
