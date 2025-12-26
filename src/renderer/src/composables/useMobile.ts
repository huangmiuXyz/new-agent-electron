const showChat = ref(false)
const showSettings = ref(false)
const showProviderForm = ref(false)
const showKnowledgeForm = ref(false)
export const useMobile = () => {
  const back = () => {
    // 优先返回表单到列表
    if (showProviderForm.value) {
      showProviderForm.value = false
      return
    }
    if (showKnowledgeForm.value) {
      showKnowledgeForm.value = false
      return
    }
    // 然后退出设置或聊天
    showChat.value = false
    showSettings.value = false
  }
  return {
    showChat,
    showSettings,
    showProviderForm,
    showKnowledgeForm,
    back
  }
}
