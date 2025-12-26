const showChat = ref(false)
const showSettings = ref(false)
export const useMobile = () => {
  const back = () => {
    showChat.value = false
    showSettings.value = false
  }
  return {
    showChat,
    showSettings,
    back
  }
}
