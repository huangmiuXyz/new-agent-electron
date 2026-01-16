import { ref } from 'vue'

const customTitle = ref('')

export const useAppHeader = () => {
  const setTitle = (title: string) => {
    customTitle.value = title
  }

  const resetTitle = () => {
    customTitle.value = ''
  }

  return {
    customTitle,
    setTitle,
    resetTitle
  }
}
