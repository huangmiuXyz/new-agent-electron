import { ref } from 'vue'
import { useSettingsStore } from '@renderer/stores/settings'

const MAX_HISTORY = 200

export function useInputHistory() {
  const settingsStore = useSettingsStore()
  const history = ref<string[]>(settingsStore.chatInputHistory)
  /** -1 = not browsing history, 0+ = index into history (0 = oldest) */
  const historyIndex = ref(-1)
  /** Backup of the current draft when user starts browsing history */
  const draftBackup = ref('')

  function persist() {
    settingsStore.updateChatInputHistory(history.value)
  }

  function saveToHistory(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    // Avoid consecutive duplicates
    if (history.value[history.value.length - 1] === trimmed) return
    history.value.push(trimmed)
    if (history.value.length > MAX_HISTORY) {
      history.value = history.value.slice(-MAX_HISTORY)
    }
    persist()
    historyIndex.value = -1
    draftBackup.value = ''
  }

  /**
   * Navigate backward through history (older entries).
   * Requires cursor at beginning (caretOffset === 0) to take effect.
   * Stops at the oldest entry without cycling back to draft.
   */
  function navigateUp(caretOffset: number, currentText: string): string | null {
    if (history.value.length === 0) return null
    // Always require cursor at beginning
    if (caretOffset > 0) return null

    if (historyIndex.value === -1) {
      // Enter browsing mode from the newest entry; save draft backup
      draftBackup.value = currentText
      historyIndex.value = history.value.length - 1
      return history.value[historyIndex.value]
    }

    if (historyIndex.value > 0) {
      // Go further back
      historyIndex.value--
      return history.value[historyIndex.value]
    }

    // Already at the oldest entry: stay put, no cycling
    return history.value[0]
  }

  /**
   * Navigate forward through history (newer entries).
   * Requires cursor at end (caretOffset === textLength) to take effect.
   * Stops at the newest entry without cycling back to draft.
   */
  function navigateDown(caretOffset: number, textLength: number, currentText: string): string | null {
    if (history.value.length === 0) return null
    // Always require cursor at end
    if (caretOffset < textLength) return null

    if (historyIndex.value === -1) {
      // Enter browsing mode from the oldest entry; save draft backup
      draftBackup.value = currentText
      historyIndex.value = 0
      return history.value[historyIndex.value]
    }

    if (historyIndex.value < history.value.length - 1) {
      // Go further forward
      historyIndex.value++
      return history.value[historyIndex.value]
    }

    // Already at the newest entry: stay put, no cycling
    return history.value[history.value.length - 1]
  }

  function saveDraftBackup(text: string) {
    if (historyIndex.value === -1) {
      draftBackup.value = text
    }
  }

  function resetIndex() {
    historyIndex.value = -1
    draftBackup.value = ''
  }

  return {
    history,
    historyIndex,
    saveToHistory,
    navigateUp,
    navigateDown,
    saveDraftBackup,
    resetIndex
  }
}
