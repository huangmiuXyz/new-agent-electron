<script setup lang="ts">
import { useSpeechStore } from '../stores/speech'

const speechStore = useSpeechStore()
const Play = useIcon('Play')
const Pause = useIcon('Pause')
const Stop = useIcon('Stop')

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const activeChunkIndex = computed(() => {
  return speechStore.queue.findIndex(chunk => chunk.id === speechStore.currentChunkId)
})

const totalDuration = computed(() => {
  return speechStore.queue.reduce((acc, chunk) => acc + (chunk.duration || 0), 0)
})

const totalProgress = computed(() => {
  if (totalDuration.value === 0) return 0
  let playedDuration = 0
  for (let i = 0; i < speechStore.queue.length; i++) {
    const chunk = speechStore.queue[i]
    if (chunk.id === speechStore.currentChunkId) {
      playedDuration += speechStore.currentTime
      break
    }
    if (chunk.played) {
      playedDuration += (chunk.duration || 0)
    }
  }
  return (playedDuration / totalDuration.value) * 100
})

const currentChunkText = computed(() => {
  const chunk = speechStore.queue.find(c => c.id === speechStore.currentChunkId)
  return chunk?.text || ''
})

const canPrev = computed(() => activeChunkIndex.value > 0)
const canNext = computed(() => activeChunkIndex.value < speechStore.queue.length - 1)

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const handlePrev = () => {
  if (activeChunkIndex.value > 0) {
    speechStore.jumpToChunk(speechStore.queue[activeChunkIndex.value - 1].id)
  }
}

const handleNext = () => {
  if (activeChunkIndex.value < speechStore.queue.length - 1) {
    speechStore.jumpToChunk(speechStore.queue[activeChunkIndex.value + 1].id)
  }
}

const handleSeek = (e: Event) => {
  const target = e.target as HTMLInputElement
  const percent = parseFloat(target.value) / 100
  const targetTime = percent * totalDuration.value
  let accumulatedTime = 0
  for (const chunk of speechStore.queue) {
    const chunkDuration = chunk.duration || 0
    if (accumulatedTime + chunkDuration >= targetTime) {
      speechStore.jumpToChunk(chunk.id)
      break
    }
    accumulatedTime += chunkDuration
  }
}

const handleChunkClick = (chunkId: string) => {
  speechStore.jumpToChunk(chunkId)
}

const lyricsContainer = ref<HTMLElement | null>(null)

watch(activeChunkIndex, (newIndex) => {
  if (newIndex !== -1 && lyricsContainer.value) {
    const activeElement = lyricsContainer.value.children[newIndex] as HTMLElement
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
})
</script>

<template>
  <div class="speech-sidebar" :class="{ collapsed }">
    <!-- Empty State -->
    <div v-if="speechStore.queue.length === 0" class="empty-state">
      <div class="empty-visual">
        <div class="empty-disc"></div>
        <div class="empty-glow"></div>
      </div>
      <p class="empty-title">暂无音频</p>
      <p class="empty-hint">对话中开启语音合成即可播放</p>
    </div>

    <template v-else>
      <!-- Mini Player Header -->
      <div class="player-head">
        <div class="art-wrap">
          <div class="art-disc" :class="{ spinning: speechStore.isPlaying }">
            <div class="art-inner"></div>
          </div>
          <div class="art-ring" :class="{ pulse: speechStore.isPlaying }"></div>
        </div>
        <div class="head-meta">
          <span class="head-label">正在播放</span>
          <p class="head-text">{{ currentChunkText || '语音片段' }}</p>
        </div>
      </div>

      <!-- Lyrics -->
      <div class="lyrics" ref="lyricsContainer">
        <div
          v-for="chunk in speechStore.queue"
          :key="chunk.id"
          class="lyric"
          :class="{
            '-a': chunk.id === speechStore.currentChunkId,
            '-p': chunk.played && chunk.id !== speechStore.currentChunkId,
            '-l': chunk.loading,
            '-e': !!chunk.error
          }"
          :title="chunk.error"
          @click="handleChunkClick(chunk.id)"
        >
          <span v-if="chunk.error" class="err-badge">!</span>
          <span class="lyric-txt">{{ chunk.text }}</span>
          <span v-if="chunk.id === speechStore.currentChunkId && speechStore.isPlaying" class="viz">
            <span></span><span></span><span></span><span></span>
          </span>
        </div>
      </div>

      <!-- Bottom Player -->
      <div class="dock">
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          :value="totalProgress"
          class="seek"
          :style="{ '--p': totalProgress + '%' }"
          @input="handleSeek"
        />
        <div class="dock-row">
          <span class="t t-l">{{ formatTime(speechStore.currentTime) }}</span>
          <div class="btns">
            <button class="b b-s" :class="{ off: !canPrev }" :disabled="!canPrev" @click="handlePrev">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" />
              </svg>
            </button>
            <button class="b b-p" @click="speechStore.togglePlay">
              <Pause v-if="speechStore.isPlaying" />
              <Play v-else />
            </button>
            <button class="b b-s" :class="{ off: !canNext }" :disabled="!canNext" @click="handleNext">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
              </svg>
            </button>
            <button class="b b-stop" @click="speechStore.stop">
              <Stop />
            </button>
          </div>
          <span class="t t-r">{{ formatTime(totalDuration) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style>
/* ─── Light mode (default) ─── */
.speech-sidebar,
.speech-sidebar * {
  --g-accent: #d64540;
  --g-accent-dim: rgba(214, 69, 64, 0.1);
  --g-accent-soft: rgba(214, 69, 64, 0.06);
  --g-accent-glow: rgba(214, 69, 64, 0.2);
  --g-bg: #f5f3ef;
  --g-surface: rgba(255, 255, 255, 0.92);
  --g-border: rgba(0, 0, 0, 0.06);
  --g-border-strong: rgba(0, 0, 0, 0.1);
  --g-text: #1a1a1a;
  --g-text-dim: #555555;
  --g-text-muted: #999999;
  --g-mask: #000;
}

/* ─── Dark mode ─── */
.dark-mode .speech-sidebar,
.dark-mode .speech-sidebar * {
  --g-accent: #fc2c50;
  --g-accent-dim: rgba(252, 44, 80, 0.15);
  --g-accent-soft: rgba(252, 44, 80, 0.08);
  --g-accent-glow: rgba(252, 44, 80, 0.3);
  --g-bg: #161616;
  --g-surface: rgba(29, 29, 28, 0.85);
  --g-border: rgba(255, 255, 255, 0.06);
  --g-border-strong: rgba(255, 255, 255, 0.1);
  --g-text: #eff1f4;
  --g-text-dim: rgba(239, 241, 244, 0.55);
  --g-text-muted: rgba(239, 241, 244, 0.3);
  --g-mask: #000;
}
</style>

<style scoped>
/* ─── Base ─── */
.speech-sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--g-bg);
  position: relative;
  overflow: hidden;
  user-select: none;
}
.speech-sidebar.collapsed { display: none; }

/* ─── Empty ─── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 32px 24px;
  text-align: center;
}
.empty-visual {
  position: relative;
  width: 72px;
  height: 72px;
  margin-bottom: 4px;
}
.empty-disc {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, var(--g-accent), #ff6b6b, #fbbc05, var(--g-accent));
  opacity: 0.25;
  position: absolute;
  inset: 0;
}
.empty-glow {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  position: absolute;
  inset: 0;
  background: var(--g-accent);
  filter: blur(28px);
  opacity: 0.08;
}
.empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--g-text);
  letter-spacing: 0.3px;
}
.empty-hint {
  margin: 0;
  font-size: 12px;
  color: var(--g-text-muted);
  line-height: 1.5;
  max-width: 200px;
}

/* ─── Player Head ─── */
.player-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px 10px;
}
.art-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}
.art-disc {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, var(--g-accent), #ff6b6b, #fbbc05, var(--g-accent));
  position: relative;
  z-index: 1;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.art-disc.spinning {
  animation: spin 3s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.art-inner {
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: var(--g-bg);
}
.art-ring {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1.5px solid var(--g-accent-dim);
  transition: all 0.3s;
}
.art-ring.pulse {
  animation: ring-pulse 2s ease-in-out infinite;
}
@keyframes ring-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.08); opacity: 0.4; }
}
.head-meta {
  flex: 1;
  min-width: 0;
}
.head-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--g-accent);
  display: block;
  margin-bottom: 2px;
}
.head-text {
  margin: 0;
  font-size: 12px;
  font-weight: 400;
  color: var(--g-text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

/* ─── Lyrics ─── */
.lyrics {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 6px 12px;
  gap: 1px;
  scroll-behavior: smooth;
  mask-image: linear-gradient(to bottom, transparent 0%, var(--g-mask) 6%, var(--g-mask) 80%, transparent 96%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, var(--g-mask) 6%, var(--g-mask) 80%, transparent 96%);
}
.lyrics::-webkit-scrollbar { width: 0; }

.lyric {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
}
.lyric:hover {
  background: var(--g-accent-soft);
}

.lyric-txt {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--g-text-muted);
  transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  letter-spacing: 0.1px;
}

/* played (past) */
.lyric.-p .lyric-txt {
  color: var(--g-text-dim);
}

/* active */
.lyric.-a {
  background: var(--g-accent-dim);
  padding: 10px 12px;
  margin: 3px 0;
}
.lyric.-a .lyric-txt {
  font-size: 14px;
  font-weight: 500;
  color: var(--g-text);
  letter-spacing: 0.2px;
}

/* loading */
.lyric.-l { opacity: 0.35; pointer-events: none; }
.lyric.-l .lyric-txt::after {
  content: '';
  display: inline-block;
  width: 3px;
  height: 14px;
  margin-left: 4px;
  background: var(--g-text-muted);
  animation: blink 0.8s steps(2) infinite;
  vertical-align: middle;
}
@keyframes blink { 0% { opacity: 0; } 100% { opacity: 1; } }

/* error */
.lyric.-e .lyric-txt { color: var(--g-accent); opacity: 0.6; text-decoration: line-through; }
.err-badge {
  font-size: 9px;
  font-weight: 700;
  color: var(--g-accent);
  background: var(--g-accent-dim);
  padding: 0 5px;
  border-radius: 3px;
  flex-shrink: 0;
  line-height: 16px;
}

/* voice viz */
.viz {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
  margin-left: auto;
  flex-shrink: 0;
}
.viz span {
  width: 2.5px;
  background: var(--g-accent);
  border-radius: 2px;
  animation: bar 0.7s ease-in-out infinite;
}
.viz span:nth-child(1) { height: 5px; animation-delay: 0s; }
.viz span:nth-child(2) { height: 10px; animation-delay: 0.12s; }
.viz span:nth-child(3) { height: 7px; animation-delay: 0.25s; }
.viz span:nth-child(4) { height: 12px; animation-delay: 0.37s; }
@keyframes bar {
  0%, 100% { transform: scaleY(0.45); opacity: 0.5; }
  50% { transform: scaleY(1); opacity: 1; }
}

/* ─── Dock ─── */
.dock {
  padding: 6px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--g-surface);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-top: 1px solid var(--g-border);
}

/* seek */
.seek {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  background: linear-gradient(to right, var(--g-accent) 0%, var(--g-accent) var(--p, 0%), var(--g-border-strong) var(--p, 0%), var(--g-border-strong) 100%);
}
.seek::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: var(--g-accent);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 8px var(--g-accent-glow);
  transition: transform 0.15s;
}
.seek::-webkit-slider-thumb:hover { transform: scale(1.2); }
.seek::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; }
.seek::-moz-range-track { height: 3px; border-radius: 2px; background: var(--g-border-strong); border: none; }
.seek::-moz-range-thumb {
  width: 12px; height: 12px;
  background: var(--g-accent);
  border-radius: 50%;
  border: none;
  cursor: pointer;
}

.dock-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.t {
  font-size: 10px;
  font-family: 'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace;
  color: var(--g-text-muted);
  flex-shrink: 0;
  min-width: 30px;
  letter-spacing: 0.5px;
}
.t-l { text-align: right; }
.t-r { text-align: left; }

.btns {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.b {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
  color: var(--g-text-dim);
  padding: 0;
}
.b:active { transform: scale(0.92); }

.b-s {
  width: 30px;
  height: 28px;
}
.b-s:hover { background: var(--g-accent-soft); color: var(--g-text); }
.b-s.off { opacity: 0.2; pointer-events: none; }

/* play button */
.b-p {
  width: 36px;
  height: 32px;
  background: var(--g-accent);
  color: #fff;
  border-radius: 8px;
  box-shadow: 0 0 12px var(--g-accent-glow);
}
.b-p:hover {
  background: var(--g-accent);
  filter: brightness(1.15);
  box-shadow: 0 0 20px var(--g-accent-glow);
  transform: scale(1.04);
}
.b-p :deep(svg) { width: 18px; height: 18px; }

.b-stop { width: 28px; height: 28px; }
.b-stop:hover { color: var(--g-accent); background: var(--g-accent-dim); }
.b-stop :deep(svg) { width: 15px; height: 15px; }

/* ─── Responsive ─── */
@media (max-height: 500px) {
  .player-head { padding: 10px 12px 6px; }
  .art-wrap, .art-disc { width: 36px; height: 36px; }
  .dock { padding: 4px 12px 10px; }
  .lyrics { padding: 4px 8px; }
}
</style>
