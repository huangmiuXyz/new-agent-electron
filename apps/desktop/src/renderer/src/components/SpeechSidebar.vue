<script setup lang="ts">
import { useSpeechStore } from '../stores/speech'

const speechStore = useSpeechStore()

defineProps<{ collapsed?: boolean }>()
defineEmits<{ (e: 'close'): void }>()

const idx = computed(() => speechStore.queue.findIndex(c => c.id === speechStore.currentChunkId))

const total = computed(() =>
  speechStore.queue.reduce((a, c) => a + (c.duration || 0), 0)
)

const progress = computed(() => {
  if (total.value === 0) return 0; let p = 0
  for (const c of speechStore.queue) {
    if (c.id === speechStore.currentChunkId) { p += speechStore.currentTime; break }
    if (c.played) p += (c.duration || 0)
  }
  return (p / total.value) * 100
})

const canPrev = computed(() => idx.value > 0)
const canNext = computed(() => idx.value < speechStore.queue.length - 1)

const fmt = (s: number) => {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

const readingPct = (id: string) => {
  if (id !== speechStore.currentChunkId) return '0%'
  const chunk = speechStore.queue.find(c => c.id === id)
  if (!chunk?.duration || chunk.duration <= 0) return '100%'
  return Math.min(100, (speechStore.currentTime / chunk.duration) * 100) + '%'
}

const prev = () => { if (canPrev.value) speechStore.jumpToChunk(speechStore.queue[idx.value - 1].id) }
const next = () => { if (canNext.value) speechStore.jumpToChunk(speechStore.queue[idx.value + 1].id) }
const seek = (e: MouseEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
  const t = pct * total.value; let a = 0
  for (const c of speechStore.queue) {
    const d = c.duration || 0
    if (a + d >= t) { speechStore.jumpToChunk(c.id); break }; a += d
  }
}
const click = (id: string) => speechStore.jumpToChunk(id)

const box = ref<HTMLElement | null>(null)
watch(idx, (i) => {
  if (i !== -1 && box.value) {
    const el = box.value.children[i] as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

type RepeatMode = 'none' | 'all' | 'one'
const repeatMode = ref<RepeatMode>('none')
const toggleRepeat = () => {
  if (repeatMode.value === 'none') repeatMode.value = 'all'
  else if (repeatMode.value === 'all') repeatMode.value = 'one'
  else repeatMode.value = 'none'
}

const prevVolume = ref(1)
const toggleMute = () => {
  if (speechStore.volume === 0) {
    speechStore.volume = prevVolume.value
  } else {
    prevVolume.value = speechStore.volume
    speechStore.volume = 0
  }
}

const handledEnd = ref(false)
watch(() => Math.floor(speechStore.currentTime * 10), (tick) => {
  if (idx.value === -1 || !speechStore.isPlaying) return
  const cur = speechStore.queue[idx.value]
  if (!cur || !cur.duration || cur.duration < 0.5) return
  if (tick >= Math.floor((cur.duration - 0.25) * 10) && !handledEnd.value) {
    handledEnd.value = true
    if (repeatMode.value === 'one') {
      speechStore.jumpToChunk(cur.id)
    } else if (repeatMode.value === 'all') {
      const next = speechStore.queue[idx.value + 1] || speechStore.queue[0]
      speechStore.jumpToChunk(next.id)
    }
  }
  if (tick < Math.floor((cur.duration - 1) * 10)) {
    handledEnd.value = false
  }
})
</script>

<template>
  <aside class="sb" :class="{ collapsed }">
    <div v-if="speechStore.queue.length === 0" class="ee">
      <div class="ee__icon"><i class="fa-solid fa-music"></i></div>
      <p class="ee__t">暂无音频</p>
      <p class="ee__d">在对话中启用语音，音频将出现在这里</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="hd">
        <span class="hd__t">播放列表</span>
        <span class="hd__c">{{ speechStore.queue.length }} 首</span>
      </div>

      <!-- Tracks -->
      <div class="lx" ref="box">
        <div
          v-for="(c, i) in speechStore.queue"
          :key="c.id"
          class="lx__r"
          :class="{ cur: c.id === speechStore.currentChunkId, done: c.played && c.id !== speechStore.currentChunkId, err: !!c.error, ld: c.loading && !c.streaming, streaming: c.streaming }"
          :title="c.error"
          @click="click(c.id)"
        >
          <span class="lx__n">{{ String(i + 1).padStart(2, '0') }}</span>
          <div class="lx__b">
            <span
            class="lx__t"
            :class="{
              'lx__t--cur': c.id === speechStore.currentChunkId || c.streaming,
              'lx__t--reading': c.id === speechStore.currentChunkId && c.duration && c.duration > 0
            }"
            :style="c.id === speechStore.currentChunkId && c.duration ? { '--read-pct': readingPct(c.id) } : {}"
          >{{ c.text || '...' }}</span>
            <div class="lx__meta">
              <span class="lx__d" v-if="c.streaming && !c.duration">生成中...</span>
              <span class="lx__d" v-else>{{ c.duration ? fmt(c.duration) : '--:--' }}</span>
              <div v-if="c.id === speechStore.currentChunkId" class="lx__prog">
                <div
                  v-if="c.duration && c.duration > 0"
                  class="lx__prog-fill"
                  :style="{ width: Math.min(100, (speechStore.currentTime / c.duration) * 100) + '%' }"
                ></div>
                <div v-else class="lx__prog-fill lx__prog-fill--indet"></div>
              </div>
            </div>
          </div>
          <span class="lx__e" v-if="c.error">!</span>
          <span class="lx__v" v-if="c.streaming && !c.played"><i></i><i></i><i></i></span>
          <span class="lx__v lx__v--idle" v-else-if="c.id === speechStore.currentChunkId"><i></i><i></i><i></i></span>
        </div>
      </div>

      <!-- Player -->
      <div class="pl">
        <div class="pl__btns">
          <button class="btn" :class="{ 'is-on': repeatMode !== 'none', 'is-one': repeatMode === 'one' }" title="循环播放" @click="toggleRepeat">
            <i class="fa-solid fa-rotate" v-if="repeatMode !== 'one'"></i>
            <span v-else class="rp"><i class="fa-solid fa-rotate"></i><i>1</i></span>
          </button>
          <button class="btn" title="上一首" :disabled="!canPrev" @click="prev"><i class="fa-solid fa-backward-step"></i></button>
          <button class="btn btn--play" title="暂停/播放" @click="speechStore.togglePlay">
            <i class="fa-solid fa-pause" v-if="speechStore.isPlaying"></i>
            <i class="fa-solid fa-play" v-else></i>
          </button>
          <button class="btn" title="下一首" :disabled="!canNext" @click="next"><i class="fa-solid fa-forward-step"></i></button>
          <button class="btn" title="停止" @click="speechStore.stop"><i class="fa-solid fa-stop"></i></button>
          <div class="pl__vol">
            <button class="btn" title="音量" @click="toggleMute">
              <i
                class="fa-solid"
                :class="speechStore.volume === 0 ? 'fa-volume-xmark' : speechStore.volume < 0.5 ? 'fa-volume-low' : 'fa-volume-high'"
              ></i>
            </button>
            <div class="pl__vol-popup">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                class="pl__vol-slider"
                :value="speechStore.volume"
                @input="speechStore.volume = parseFloat(($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </div>
        <div class="pl__prog">
          <span class="pl__tm">{{ fmt(speechStore.currentTime) }}</span>
          <div class="pl__bar" @click="seek">
            <div class="pl__fill" :style="{ width: progress + '%' }"></div>
            <div class="pl__knob" :style="{ left: progress + '%' }"></div>
          </div>
          <span class="pl__tm">{{ fmt(total) }}</span>
        </div>
      </div>
    </template>
  </aside>
</template>

<style>
@import '@fortawesome/fontawesome-free/css/all.min.css';
</style>

<style scoped>
.sb {
  height: 100%; display: flex; flex-direction: column;
  overflow: hidden; user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif;
  background: var(--bg-sidebar, #ffffff);
  color: var(--text-main, #1d1d1f);
}
.sb.collapsed { display: none; }

/* empty */
.ee { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 0 36px; text-align: center; }
.ee__icon { width: 52px; height: 52px; border-radius: 50%; background: var(--sidebar-hover-bg, rgba(0,0,0,0.04)); display: flex; align-items: center; justify-content: center; color: var(--text-sub, #6b7280); font-size: 20px; }
.ee__t { margin: 0; font-size: 14px; font-weight: 600; color: var(--text-main, #1d1d1f); }
.ee__d { margin: 0; font-size: 12px; line-height: 1.5; color: var(--text-sub, #6b7280); }

/* header */
.hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px 4px;
}
.hd__t { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-main, #1d1d1f); }
.hd__c { font-size: 11px; color: var(--text-sub, #6b7280); font-weight: 500; }

/* tracks */
.lx {
  flex: 1; overflow-y: auto; padding: 2px 12px 6px;
  display: flex; flex-direction: column; gap: 1px;
  scroll-behavior: smooth;
}
.lx::-webkit-scrollbar { width: 0; }

.lx__r {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-radius: var(--sidebar-item-radius, 6px);
  cursor: pointer; min-height: var(--sidebar-item-h, 36px);
  transition: background 0.15s ease;
}
.lx__r:hover { background: var(--sidebar-hover-bg, rgba(0,0,0,0.04)); }
.lx__r.done { opacity: 0.35; }
.lx__r.ld  { opacity: 0.2; pointer-events: none; }
.lx__r.streaming { opacity: 0.85; background: var(--sidebar-streaming-bg, rgba(0,122,255,0.04)); }
.lx__r.err { opacity: 0.4; }
.lx__r.cur {
  background: var(--sidebar-active-bg, rgba(0,0,0,0.07));
  box-shadow: inset 3px 0 0 var(--sidebar-active-accent, var(--color-primary, #007aff));
}

.lx__n {
  flex-shrink: 0; width: 18px;
  font-size: 10px; font-weight: 500;
  color: var(--text-sub, #6b7280);
  text-align: right; font-variant-numeric: tabular-nums;
  transition: color 0.2s ease;
}
.lx__r.cur .lx__n { color: var(--sidebar-active-accent, var(--color-primary, #007aff)); }

.lx__b {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 1px;
}

.lx__t {
  font-size: 13px; line-height: 1.4;
  color: var(--text-sub, #6b7280);
  transition: all 0.22s ease;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lx__r.done .lx__t { color: var(--text-sub, #6b7280); }
.lx__r.cur .lx__t { font-size: 13px; font-weight: 600; color: var(--text-main, #1d1d1f); }
.lx__r.err .lx__t { color: var(--color-danger, #ff3b30); text-decoration: line-through; }

.lx__d {
  font-size: 10px; color: var(--text-sub, #6b7280);
  font-family: 'SF Mono', monospace;
  opacity: 0.55;
}

.lx__t--cur {
  white-space: normal; word-break: break-word;
  overflow: visible; text-overflow: clip;
  -webkit-line-clamp: unset;
}

.lx__t--reading {
  background: linear-gradient(
    to right,
    var(--color-primary, #007aff) var(--read-pct, 0%),
    var(--text-main, #1d1d1f) var(--read-pct, 0%)
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.lx__meta {
  display: flex; align-items: center; gap: 8px;
  margin-top: 2px;
}

.lx__prog {
  flex: 1; max-width: 100px;
  height: 2px;
  background: var(--border-color, rgba(0,0,0,0.08));
  border-radius: 2px; overflow: hidden;
}

.lx__prog-fill {
  height: 100%;
  background: var(--color-primary, #007aff);
  border-radius: 2px;
  transition: width 0.15s linear;
}

.lx__prog-fill--indet {
  width: 30%;
  animation: prog-indet 1.4s ease-in-out infinite;
}

@keyframes prog-indet {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(calc(100px / 0.3 + 100%)); }
}

.lx__e {
  flex-shrink: 0; font-size: 8px; font-weight: 700;
  color: var(--color-danger, #ff3b30);
  background: rgba(255,59,48,0.1);
  padding: 1px 5px; border-radius: 4px; line-height: 14px;
}

.lx__v { display: flex; align-items: flex-end; gap: 2px; height: 14px; flex-shrink: 0; }
.lx__v i { width: 2px; border-radius: 2px; background: var(--color-primary, #007aff); animation: vb 0.8s ease-in-out infinite; }
.lx__v--idle i { opacity: 0.2; transform: scaleY(0.4); animation: none; }
.lx__r.streaming .lx__v i { background: var(--accent-color, #34c759); }
.lx__v i:nth-child(1) { height: 6px;  animation-delay: 0s; }
.lx__v i:nth-child(2) { height: 12px; animation-delay: 0.15s; }
.lx__v i:nth-child(3) { height: 8px;  animation-delay: 0.3s; }
@keyframes vb { 0%,100% { transform: scaleY(0.4); opacity: 0.35; } 50% { transform: scaleY(1); opacity: 1; } }

/* player */
.pl {
  padding: 8px 14px 12px;
  display: flex; flex-direction: column; gap: 8px;
  border-top: 1px solid var(--border-color, rgba(0,0,0,0.08));
  overflow: visible;
}

.pl__btns {
  display: flex; justify-content: center; align-items: center; gap: 20px;
}

.btn {
  background: transparent; border: none;
  color: var(--text-sub, #6b7280); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 50%;
  transition: all 0.15s ease; padding: 0; font-size: 16px;
}
.btn:hover:not(:disabled) { color: var(--text-main, #1d1d1f); }
.btn:active:not(:disabled) { transform: scale(0.88); }
.btn:disabled { opacity: 0.12; pointer-events: none; }

.btn.is-on { color: var(--color-primary, #007aff); }
.btn.is-one { position: relative; }
.rp { position: relative; display: flex; align-items: center; justify-content: center; }
.rp i:first-child { font-size: 16px; }
.rp i:last-child { position: absolute; bottom: -3px; right: -5px; font-size: 7px; font-style: normal; font-weight: 700; background: var(--color-primary, #007aff); color: #fff; border-radius: 3px; line-height: 10px; padding: 0 3px; }

.btn--play {
  width: 44px; height: 38px;
  border-radius: 999px;
  background: var(--color-primary, #007aff);
  color: #fff;
  font-size: 18px;
  box-shadow: 0 2px 8px rgba(0,122,255,0.2);
}
.btn--play:hover { filter: brightness(1.08); color: #fff; }
.btn--play:active { transform: scale(0.93); }

/* progress */
.pl__prog { display: flex; align-items: center; gap: 10px; }
.pl__tm {
  font-size: 10px; font-family: 'SF Mono', monospace;
  color: var(--text-sub, #6b7280);
  flex-shrink: 0; min-width: 26px; text-align: center;
}
.pl__bar {
  flex: 1; height: 3px;
  background: var(--border-color, rgba(0,0,0,0.08));
  border-radius: 2px; cursor: pointer; position: relative;
}
.pl__fill {
  position: absolute; left: 0; top: 0; height: 100%;
  background: var(--color-primary, #007aff);
  border-radius: 2px;
  transition: width 0.08s linear;
}
.pl__knob {
  position: absolute; top: 50%; width: 8px; height: 8px;
  background: var(--color-primary, #007aff);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}
.pl__bar:hover .pl__knob { opacity: 1; }

/* volume */
.pl__vol {
  position: relative; display: flex; align-items: center;
  margin-left: 4px;
}
.pl__vol-popup {
  position: absolute;
  left: 50%; bottom: calc(100% + 8px);
  transform: translateX(-50%);
  display: none;
  padding: 8px 10px;
  background: var(--bg-sidebar, #fff);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  z-index: 10;
}
.pl__vol-popup::after {
  content: ''; position: absolute;
  left: 50%; bottom: -6px;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--bg-sidebar, #fff);
}
.pl__vol::before {
  content: ''; position: absolute;
  left: 0; right: 0; bottom: 100%;
  height: 24px;
  pointer-events: none;
}
.pl__vol:hover .pl__vol-popup,
.pl__vol-popup:hover {
  display: flex; align-items: center;
}
.pl__vol:hover::before {
  pointer-events: auto;
}
.pl__vol-slider {
  -webkit-appearance: none; appearance: none;
  width: 64px; height: 4px;
  background: var(--border-color, rgba(0,0,0,0.12));
  border-radius: 2px; outline: none; cursor: pointer;
}
.pl__vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--text-sub, #6b7280);
  cursor: pointer;
  transition: transform 0.15s ease;
}
.pl__vol-slider::-webkit-slider-thumb:hover {
  transform: scale(1.25);
}
.pl__vol-slider::-moz-range-thumb {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--text-sub, #6b7280);
  cursor: pointer; border: none;
}

@media (max-height: 500px) {
  .lx { padding: 0 10px 4px; }
  .lx__r { padding: 4px 6px; min-height: 30px; }
  .pl { padding: 4px 12px 8px; }
  .pl__btns { gap: 12px; }
  .btn--play { width: 36px; height: 32px; font-size: 14px; }
}
</style>
