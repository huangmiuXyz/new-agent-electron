<script setup lang="ts">
const { showContextMenu } = useContextMenu<BaseMessage>();
const { currentChat } = storeToRefs(useChatsStores())
const { deleteMessage } = useChatsStores()
const { Delete, Refresh, Copy, Edit, Branch } = useIcon(['Delete', 'Refresh', 'Copy', 'Edit', 'Branch'])

// 存储当前需要编辑的消息ID
const editingMessageId = ref<string | null>(null)

// 提供编辑功能给子组件
const triggerEdit = (messageId: string) => {
  editingMessageId.value = messageId
}

// 提供取消编辑功能
const cancelEdit = () => {
  editingMessageId.value = null
}

provide('messageEdit', {
  editingMessageId,
  triggerEdit,
  cancelEdit
})

const onMessageRightClick = (event: MouseEvent, message: BaseMessage) => {
  event.preventDefault();
  event.stopPropagation();
  const messageMenuOptions: MenuItem<BaseMessage>[] = [
    {
      label: '编辑',
      icon: Edit,
      onClick: () => {
        triggerEdit(message.id!);
      }
    },
    {
      label: '从消息创建聊天分支',
      icon: Branch,
      onClick: (data) => {
        const { forkChat } = useChatsStores()
        forkChat(currentChat.value!.id, data.id!)
      }
    },
    {
      label: '复制',
      icon: Copy,
      onClick: () => copyText(message.parts.map(e => e.type === 'text' ? e.text : '').join(''))
    },
    {
      label: '重试',
      icon: Refresh,
      onClick: async (data) => {
        const { regenerate } = useChat(currentChat.value!.id!)
        regenerate(data.id!)
      }
    },
    {
      label: '删除',
      icon: Delete,
      danger: true,
      onClick: (data) => {
        data.metadata?.stop?.()
        setTimeout(() => {
          deleteMessage(currentChat.value!.id, message.id!)
        });
      }
    }
  ];
  showContextMenu(event, messageMenuOptions, message);
};
</script>
<template>
  <div class="messages">
    <template v-for="(message, index) in currentChat?.messages" :key="`${message.id}-${index}`">
      <ChatMessageItemHuman v-if="message.role === 'user'" :message="message"
        @contextmenu="onMessageRightClick($event, message)" />
      <ChatMessageItemAi v-if="message.role === 'assistant'" :message="message"
        @contextmenu="onMessageRightClick($event, message)" />
    </template>
  </div>
</template>

<style scoped>
.messages {
  flex: 1;
  padding: 20px 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
</style>
