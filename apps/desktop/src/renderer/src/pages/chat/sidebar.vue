<script setup lang="ts">
import { isMobile } from '@renderer/composables/useDeviceType'
const chatsStore = useChatsStores()
const { showContextMenu } = useContextMenu()
const chatsIcon = useIcon('Chat')
const { ChevronDown, ChevronRight, Edit, Delete, CommentAdd16Regular } = useIcon([
  'ChevronDown',
  'ChevronRight',
  'Edit',
  'Delete',
  'CommentAdd16Regular'
])
const router = useRouter()
const expandedRootIds = ref<Set<string>>(new Set())
const rootChats = computed(() => chatsStore.getRootChats())

const getChildChats = (chatId: string) => chatsStore.getChildChats(chatId)

watch(
  rootChats,
  (roots) => {
    const expanded = new Set(expandedRootIds.value)
    roots.forEach((chat) => {
      if (getChildChats(chat.id).length > 0 && !expanded.has(chat.id)) {
        expanded.add(chat.id)
      }
    })
    expandedRootIds.value = expanded
  },
  { immediate: true }
)

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
  const chat = chatsStore.getChatById(chatId)
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
const showSearch = ref(false)

const isExpanded = (chatId: string) => expandedRootIds.value.has(chatId)
const toggleExpand = (chatId: string) => {
  const next = new Set(expandedRootIds.value)
  if (next.has(chatId)) {
    next.delete(chatId)
  } else {
    next.add(chatId)
  }
  expandedRootIds.value = next
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

const isChatGenerating = (chat: Chat) => {
  return chatsStore.isChatGenerating(chat.id)
}

const getSubTaskStatusLabel = (chat: Chat) => {
  switch (chat.subTask?.status) {
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'running':
      return '执行中'
    default:
      return '待执行'
  }
}
</script>

<template>
  <aside class="sidebar" :class="{ 'is-mobile': isMobile }">
    <div class="nav-list">
      <div v-if="!isMobile" class="chat-list-title">
        <div class="chat-list-title-text">聊天</div>
        <div class="chat-list-title-actions">
          <Button variant="icon" size="sm" title="新建对话" @click="createNewChat">
            <component :is="CommentAdd16Regular" />
          </Button>
        </div>
      </div>

      <!-- 空状态显示 -->
      <div v-if="!chatsStore.allChats.length" class="empty-state">
        <!-- Mobile Modern Empty State -->
        <template v-if="isMobile">
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

      <div v-if="chatsStore.allChats.length" class="chat-tree-list">
        <div v-for="rootChat in rootChats" :key="rootChat.id" class="chat-group">
          <div class="chat-tree-item root-item" :class="{ active: chatsStore.activeChatId === rootChat.id }"
            @click="selectChat(rootChat.id)" @contextmenu="showChatContextMenu($event, rootChat.id)">
            <button v-if="getChildChats(rootChat.id).length > 0" class="expand-btn"
              @click.stop="toggleExpand(rootChat.id)">
              <ChevronDown v-if="isExpanded(rootChat.id)" />
              <ChevronRight v-else />
            </button>
            <span v-else class="expand-placeholder"></span>
            <div v-if="isChatGenerating(rootChat) && rootChat.id !== chatsStore.activeChatId"
              class="status-dot generating">
            </div>
            <span v-if="chatsStore.isTitleGenerating(rootChat.id)" class="chat-title-loading"><Loading size="mini" /></span>
            <span v-else class="chat-title">{{ rootChat.title }}</span>
            <span class="item-time">{{ formatTime(rootChat.createdAt) }}</span>
          </div>

          <div v-if="isExpanded(rootChat.id) && getChildChats(rootChat.id).length > 0" class="subchat-list">
            <div v-for="subChat in getChildChats(rootChat.id)" :key="subChat.id" class="chat-tree-item sub-item"
              :class="{ active: chatsStore.activeChatId === subChat.id }" @click="selectChat(subChat.id)"
              @contextmenu="showChatContextMenu($event, subChat.id)">
              <span class="sub-indicator"></span>
              <div v-if="isChatGenerating(subChat) && subChat.id !== chatsStore.activeChatId"
                class="status-dot generating">
              </div>
              <span v-if="chatsStore.isTitleGenerating(subChat.id)" class="chat-title-loading"><Loading size="mini" /></span>
              <span v-else class="chat-title">{{ subChat.title }}</span>
              <span class="task-status" :class="`status-${subChat.subTask?.status || 'pending'}`">
                {{ getSubTaskStatusLabel(subChat) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <GlobalSearch v-model="showSearch" />
  </aside>
</template>

<style scoped>
.chat-title {
  text-wrap: nowrap;
}

.chat-title-container {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.chat-name-container {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.generating {
  background-color: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
  animation: pulse-dot 1.5s infinite;
}

@keyframes pulse-dot {
  0% {
    transform: scale(0.95);
    opacity: 0.8;
  }

  50% {
    transform: scale(1.05);
    opacity: 1;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.8);
  }

  100% {
    transform: scale(0.95);
    opacity: 0.8;
  }
}

.sidebar.is-mobile {
  background-color: var(--bg-card);
  border-right: none;
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  flex: 1;
  display: flex;
  flex-direction: column;
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
  background: var(--bg-sidebar);
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
  background-color: var(--border-color);
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
  background-color: var(--border-color);
  transition: opacity 0.2s;
}

.chat-row:hover {
  background-color: var(--bg-hover);
}

.chat-row:active {
  background-color: var(--bg-active);
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
  box-shadow: inset 0 0 0 0.5px rgba(var(--text-rgb), 0.05);
}

.temp-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-success);
  /* iOS Green */
  border: 2px solid var(--bg-card);
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
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-time {
  font-size: 13px;
  color: var(--text-secondary);
}

.chat-preview-text {
  font-size: 14px;
  color: var(--text-secondary);
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
  background: var(--bg-hover);
  border-radius: 20px;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat-bubble-sketch {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color-medium);
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
  border-top: 8px solid var(--border-color-medium);
}

.empty-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.modern-btn {
  background: var(--color-primary);
  color: var(--accent-text);
  border: none;
  padding: 12px 24px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 15px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.modern-btn:hover {
  background: var(--color-info);
  box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.3);
}

.modern-btn:active {
  transform: scale(0.96);
}

.chat-title-loading {
  flex: 1;
  display: flex;
  align-items: center;
  height: 1.4em;
}

/* Original styles for PC */
.sidebar:not(.is-mobile) {
  width: 100%;
  background-color: var(--bg-sidebar-surface);
  border-right: 1px solid var(--sidebar-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  user-select: none;
  height: 100%;
}

.sidebar:not(.is-mobile) .nav-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--sidebar-container-pad);
  background: transparent;
}

.chat-list-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  padding: 2px 4px;
}

.chat-list-title-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: -0.08px;
}

.chat-list-title-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 调整List组件的样式以匹配原有样式 */
.sidebar:not(.is-mobile) :deep(.mode-gap) {
  width: 100%;
  padding: 0;
  border-right: none;
  /* 设置自定义的选中项背景颜色 */
  --bg-active: var(--bg-active);
}

.sidebar:not(.is-mobile) :deep(.list-scroll-area) {
  padding: 0;
  background: transparent;
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
  background-color: var(--bg-active) !important;
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
  padding: 80px 24px;
  text-align: center;
  flex: 1;
}

.sidebar:not(.is-mobile) .empty-icon {
  display: none;
}

.sidebar:not(.is-mobile) .empty-text {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-tertiary);
  line-height: 1.5;
  margin-bottom: 0;
}

.sidebar:not(.is-mobile) .empty-button {
  display: none;
}

.chat-tree-list {
  display: flex;
  flex-direction: column;
  gap: var(--sidebar-gap);
}

.chat-group {
  display: flex;
  flex-direction: column;
  gap: var(--sidebar-gap);
}

.chat-tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  padding: var(--sidebar-item-pad);
  border-radius: var(--sidebar-item-radius);
  font-weight: 400;
  cursor: pointer;
  transition: background-color var(--motion-duration-fast) var(--motion-ease-standard);
}

.chat-tree-item:hover {
  background-color: var(--bg-hover);
}

.chat-tree-item.active {
  background-color: var(--sidebar-active-bg, var(--bg-active));
  font-weight: 500;
  position: relative;
}

.chat-tree-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: var(--sidebar-active-indicator-width, 3px);
  height: 55%;
  background: var(--sidebar-active-accent, var(--color-primary));
  border-radius: var(--sidebar-active-indicator-radius, 2px);
}

.expand-btn,
.expand-placeholder {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.expand-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.subchat-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: 18px;
  padding-left: 6px;
  border-left: 1px solid var(--border-subtle);
}

.sub-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border-color-medium);
  flex-shrink: 0;
}

.task-status {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  white-space: nowrap;
}

.task-status.status-running {
  color: var(--color-warning);
}

.task-status.status-completed {
  color: var(--color-success);
}

.task-status.status-failed {
  color: var(--color-danger);
}

.item-time {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.chat-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
