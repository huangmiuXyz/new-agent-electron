/**
 * TTS 语音生成服务
 * 负责与浏览器 SpeechSynthesis API 交互的底层逻辑
 */

export type TTSTriggerMode = 'sentence' | 'paragraph' | 'complete'

export interface TTSSettings {
  enabled: boolean
  voice: string
  rate: number
  pitch: number
  volume: number
  triggerMode: TTSTriggerMode
}

export interface TTSCallbacks {
  onStart?: (text: string) => void
  onEnd?: () => void
  onError?: (error: any) => void
}

class TTSService {
  private synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  private currentUtterances: SpeechSynthesisUtterance[] = []

  /**
   * 停止所有正在播放和排队的语音
   */
  public stop() {
    if (!this.synth) return
    this.synth.cancel()
    this.currentUtterances = []
  }

  /**
   * 朗读指定的文本片段
   */
  public speak(text: string, settings: TTSSettings, callbacks?: TTSCallbacks) {
    if (!this.synth || !text.trim() || !settings.enabled) return

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = settings.rate
    utterance.pitch = settings.pitch
    utterance.volume = settings.volume

    if (settings.voice) {
      const voices = this.synth.getVoices()
      const selectedVoice = voices.find((v) => v.name === settings.voice)
      if (selectedVoice) {
        utterance.voice = selectedVoice
      }
    }

    utterance.onstart = () => {
      callbacks?.onStart?.(text)
    }

    utterance.onend = () => {
      this.currentUtterances = this.currentUtterances.filter((u) => u !== utterance)
      callbacks?.onEnd?.()
    }

    utterance.onerror = (event) => {
      this.currentUtterances = this.currentUtterances.filter((u) => u !== utterance)
      callbacks?.onError?.(event)
    }

    this.currentUtterances.push(utterance)
    this.synth.speak(utterance)
  }

  /**
   * 获取当前是否正在播放
   */
  public isSpeaking(): boolean {
    return this.synth ? this.synth.speaking : false
  }

  /**
   * 根据模式切分文本
   */
  public splitText(text: string, mode: TTSTriggerMode): { chunks: string[]; remaining: string } {
    if (!text.trim() || mode === 'complete') {
      return { chunks: [], remaining: text }
    }

    const punctuationRegex = mode === 'paragraph' ? /[\n]/g : /[.!?。！？\n]/g
    const chunks: string[] = []
    let pendingText = text
    let match
    let searchIndex = 0

    while ((match = punctuationRegex.exec(pendingText.substring(searchIndex))) !== null) {
      const pIndex = searchIndex + match.index
      const chunk = pendingText.substring(0, pIndex + 1)
      if (chunk.trim()) {
        chunks.push(chunk)
      }
      pendingText = pendingText.substring(pIndex + 1)
      punctuationRegex.lastIndex = 0
      searchIndex = 0
    }

    return { chunks, remaining: pendingText }
  }
}

export const ttsService = new TTSService()
