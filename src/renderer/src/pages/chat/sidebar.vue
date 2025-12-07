<script setup lang="ts">
const chatsStore = useChatsStores();
const { showContextMenu } = useContextMenu();
const Plus = useIcon('Plus');


const chatsIcon = useIcon('Chat')

const selectChat = (chatId: string) => {
  chatsStore.setActiveChat(chatId);
};

const createNewChat = () => {
  // 创建新聊天，模型信息保存在全局状态中
  chatsStore.createChat('新的聊天');
};
const { confirm } = useModal()
const deleteChat = async (chatId: string) => {
  if (await confirm({
    title: '删除会话',
    content: '确定要删除这个聊天吗？',
    confirmProps: {
      danger: true
    }
  })) {
    chatsStore.deleteChat(chatId);
  }
};

const renameChat = async (chatId: string) => {
  const chat = chatsStore.chats.find(c => c.id === chatId);
  if (chat) {
    const [Form, { getFieldValue }] = useForm({
      fields: [{
        label: '名称',
        type: 'text',
        name: 'name',
      }],
      initialData: {
        name: chat.title
      }
    })
    if (await useModal().confirm({
      title: '重命名对话',
      content: Form
    })) {
      const newName = getFieldValue('name')
      if (newName && newName.trim()) {
        chatsStore.renameChat(chatId, newName.trim());
      }
    }
  }
};
const { Edit, Delete } = useIcon(['Edit', 'Delete'])
const showChatContextMenu = (event: MouseEvent, chatId: string) => {
  event.preventDefault();
  event.stopPropagation();
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
  ];
  showContextMenu(event, menuOptions, { chatId });
};
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
      <List v-if="chatsStore.chats.length" type="gap" :items="chatsStore.chats" :active-id="chatsStore.activeChatId!"
        :key-field="'id'" :main-field="'title'" :sub-field="'createdAt'" @select="selectChat"
        @contextmenu="showChatContextMenu">
        <template #actions="{ item }">
          <span v-if="item.createdAt" class="item-time">{{ formatTime(item.createdAt) }}</span>
        </template>
      </List>
    </div>


  </aside>
</template>

<style scoped>
/* === 侧边栏：清爽、层级分明 === */
.sidebar {
  width: 200px;
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

/* 搜索框：更现代的微边框风格 */
.search-wrapper {
  padding: 0 12px 12px;
}

.search-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: var(--radius-sm);
  padding: 6px 8px 6px 28px;
  font-size: 12px;
  outline: none;
  transition: all 0.2s ease;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23999' viewBox='0 0 256 256'%3E%3Cpath d='M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z'%3E%3C/path%3E%3C/svg%3E");
  background-size: 14px;
  background-repeat: no-repeat;
  background-position: 8px center;
}

.search-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.02);
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
  background-color: transparent;
}

:deep(.list-item:hover) {
  background-color: var(--bg-hover);
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
</style>
