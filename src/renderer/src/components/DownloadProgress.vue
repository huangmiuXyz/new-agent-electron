<script setup lang="ts">
import { computed } from 'vue'

interface Progress {
    total: number
    downloaded: number
    percent: number
}

const props = defineProps<{
    progress: Progress | null
    isDownloading: boolean
    isPaused: boolean
    statusText?: string
}>()

const emit = defineEmits<{
    (e: 'pause'): void
    (e: 'resume'): void
    (e: 'cancel'): void
}>()

const percent = computed(() => props.progress?.percent || 0)

const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const currentStatusText = computed(() => {
    if (props.isPaused) return '已暂停'
    if (percent.value >= 100) return '下载完成'
    if (props.isDownloading) return props.statusText || '正在下载...'
    return '已完成'
})
</script>

<template>
    <div class="download-progress-container" v-if="isDownloading || isPaused">
        <div class="status-header">
            <div class="status-info">
                <span class="status-label">{{ currentStatusText }}</span>
                <div class="controls">
                    <button v-if="percent < 100" class="control-btn pause-resume" :class="{ resume: isPaused }"
                        @click="isPaused ? emit('resume') : emit('pause')" :title="isPaused ? '继续下载' : '暂停下载'">
                        <svg v-if="isPaused" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                            <path d="M8 5v14l11-7z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                        <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                    </button>
                    <button v-if="percent < 100" class="control-btn cancel" @click="emit('cancel')" title="完全停止下载">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                            <path
                                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </div>
            </div>
            <span class="percent-text">{{ percent }}%</span>
        </div>

        <div class="progress-track">
            <div class="progress-bar" :style="{ width: `${percent}%` }"
                :class="{ paused: isPaused, completed: percent >= 100 }"></div>
        </div>

        <div v-if="progress" class="size-info">
            <span class="downloaded">{{ formatSize(progress.downloaded) }}</span>
            <span class="separator">/</span>
            <span class="total">{{ formatSize(progress.total) }}</span>
        </div>
    </div>
</template>

<style scoped>
.download-progress-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 8px 0;
    gap: 6px;
    animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(-4px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.status-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
}

.status-info {
    display: flex;
    align-items: center;
    gap: 8px;
}

.status-label {
    font-size: 11px;
    color: var(--text-tertiary, #888);
    font-weight: 500;
}

.controls {
    display: flex;
    align-items: center;
    gap: 4px;
}

.control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    background: transparent;
}

.control-btn.pause-resume {
    color: #faad14;
    background: rgba(250, 173, 20, 0.1);
}

.control-btn.pause-resume:hover {
    background: rgba(250, 173, 20, 0.2);
    transform: scale(1.05);
}

.control-btn.pause-resume.resume {
    color: #1890ff;
    background: rgba(24, 144, 255, 0.1);
}

.control-btn.pause-resume.resume:hover {
    background: rgba(24, 144, 255, 0.2);
}

.control-btn.cancel {
    color: #ff4d4f;
    background: rgba(255, 77, 79, 0.1);
}

.control-btn.cancel:hover {
    background: rgba(255, 77, 79, 0.2);
    transform: scale(1.05);
}

.percent-text {
    font-size: 11px;
    color: #1890ff;
    font-weight: 700;
    font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
}

.progress-track {
    width: 100%;
    height: 6px;
    background: rgba(0, 0, 0, 0.04);
    border-radius: 3px;
    overflow: hidden;
    position: relative;
}

html.dark-mode .progress-track {
    background: rgba(255, 255, 255, 0.06);
}

.progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #1890ff, #36cfc9);
    border-radius: 3px;
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 0 8px rgba(24, 144, 255, 0.3);
    position: relative;
}

.progress-bar::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    background: linear-gradient(90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.3) 50%,
            rgba(255, 255, 255, 0) 100%);
    animation: shine 2s infinite;
}

@keyframes shine {
    from {
        transform: translateX(-100%);
    }

    to {
        transform: translateX(100%);
    }
}

.progress-bar.paused {
    background: #bfbfbf;
    box-shadow: none;
}

.progress-bar.completed {
    background: linear-gradient(90deg, #52c41a, #b7eb8f);
    box-shadow: 0 0 8px rgba(82, 196, 26, 0.3);
}

.progress-bar.paused::after,
.progress-bar.completed::after {
    display: none;
}

.size-info {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--text-tertiary, #999);
    font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
    margin-top: 2px;
}

.separator {
    opacity: 0.5;
}
</style>
