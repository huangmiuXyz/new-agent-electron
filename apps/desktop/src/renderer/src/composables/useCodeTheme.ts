import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@renderer/stores/settings'
import { CODE_THEME_PAIRS, hljsCSSMap } from '@renderer/utils/codeThemes'

const STYLE_ID = 'hljs-active-theme'

let currentStyleEl: HTMLStyleElement | null = null

function getStyleEl(): HTMLStyleElement {
  if (currentStyleEl) return currentStyleEl
  currentStyleEl = document.getElementById(STYLE_ID) as HTMLStyleElement
  if (!currentStyleEl) {
    currentStyleEl = document.createElement('style')
    currentStyleEl.id = STYLE_ID
    document.head.appendChild(currentStyleEl)
  }
  return currentStyleEl
}

export function useCodeTheme() {
  const settingsStore = useSettingsStore()
  const { display } = storeToRefs(settingsStore)

  watch(
    [() => display.value.codeTheme, () => display.value.darkMode],
    () => {
      const pair = CODE_THEME_PAIRS.find(p => p.id === display.value.codeTheme) || CODE_THEME_PAIRS[0]
      const cssKey = display.value.darkMode ? pair.dark : pair.light
      const css = hljsCSSMap[cssKey]
      if (css) {
        getStyleEl().textContent = css
      }
    },
    { immediate: true }
  )
}
