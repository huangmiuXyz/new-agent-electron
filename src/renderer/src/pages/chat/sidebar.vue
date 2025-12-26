<script setup lang="ts">
const chatsStore = useChatsStores()
const { showContextMenu } = useContextMenu()
const { showChat } = useMobile()
const chatsIcon = useIcon('Chat')

const selectChat = (chatId: string) => {
  showChat.value = true
  chatsStore.setActiveChat(chatId)
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
const { Edit, Delete } = useIcon(['Edit', 'Delete'])
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
  <aside class="sidebar">
    <div class="nav-list">
      <!-- 空状态显示 -->
      <div v-if="!chatsStore.chats.length" class="empty-state">
        <div class="empty-icon">
          <chatsIcon />
        </div>
        <p class="empty-text">暂无聊天记录</p>
        <Button @click="createNewChat" variant="primary" size="sm" class="empty-button">
          开始新对话
        </Button>
      </div>
      <!-- 聊天列表 -->
      <List
        v-if="chatsStore.chats.length"
        :items="chatsStore.chats"
        :active-id="chatsStore.activeChatId!"
        :key-field="'id'"
        :main-field="'title'"
        :sub-field="'createdAt'"
        @select="selectChat"
        @contextmenu="showChatContextMenu"
      >
        <template #main="{ item }">
          <div class="chat-title-container">
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
          <span v-if="item.createdAt" class="item-time">{{ formatTime(item.createdAt) }}</span>
        </template>
      </List>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  background-color: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  user-select: none;
  height: 100%;
}

.sidebar-header {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.app-title {
  font-weight: 700;
  font-size: 14px;
  letter-spacing: -0.3px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
  margin-top: 20px;
}

.nav-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

/* 调整List组件的样式以匹配原有样式 */
:deep(.mode-gap) {
  width: 100%;
  padding: 0;
  border-right: none;
  /* 设置自定义的选中项背景颜色 */
  --bg-active: #e4e4e6;
}

:deep(.list-scroll-area) {
  padding: 0;
}

:deep(.list-item) {
  height: 40px;
  margin-bottom: 2px;
  padding: 8px;
}

:deep(.list-item:hover) {
  background-color: var(--bg-hover);
}

:deep(.list-item.is-active) {
  background-color: var(--bg-active, #e4e4e6) !important;
}

:deep(.main-text) {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
}

:deep(.item-time) {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 500;
}

/* 状态点 */
.unread-dot {
  width: 6px;
  height: 6px;
  background-color: #007aff;
  /* iOS 蓝 */
  border-radius: 50%;
  margin-left: 6px;
}

.icon-btn:hover {
  background: #f0f0f0;
  color: var(--text-primary);
}

/* 空状态样式 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--text-tertiary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-text {
  margin-bottom: 16px;
  font-size: 14px;
}

.empty-button {
  margin-top: 8px;
}

/* 操作按钮样式 */
.item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.nav-item:hover .item-actions {
  opacity: 1;
}

.nav-item.active .item-actions {
  opacity: 1;
}

/* 侧边栏底部区域 */
.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--border-subtle);
}

.footer-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
  font-weight: 500;
  gap: 10px;
  transition: all 0.2s;
}

.footer-item:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.footer-item.active {
  background-color: #e4e4e6;
  color: var(--text-primary);
}

.footer-item :deep(svg) {
  font-size: 18px;
}

/* 标题生成loading状态 */
.chat-title-container {
  display: flex;
  align-items: center;
  width: 100%;
}

.chat-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-title-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.loading-spinner-small {
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--border-subtle, #eee);
  border-top-color: var(--accent-color, #0066ff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
