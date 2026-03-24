<template>
    <div class="preview-wrapper">
        <iframe ref="iframeRef" sandbox="allow-scripts allow-same-origin" frameborder="0" scrolling="no"></iframe>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = withDefaults(defineProps<{
    html?: string
    srcdoc?: string
    channelId?: string
}>(), {
    html: '',
    srcdoc: '',
    channelId: ''
})

const emit = defineEmits<{
    sandboxEvent: [payload: any]
}>()

const iframeRef = ref<HTMLIFrameElement>()
let cleanupIframeKeyListeners: (() => void) | null = null

function cleanupKeyBridge() {
    if (cleanupIframeKeyListeners) {
        cleanupIframeKeyListeners()
        cleanupIframeKeyListeners = null
    }
}

function attachIframeKeyBridge() {
    cleanupKeyBridge()

    const iframe = iframeRef.value
    const win = iframe?.contentWindow
    const doc = iframe?.contentDocument
    if (!iframe || !win || !doc) return

    const dispatchEscapeEvent = (phase: 'down' | 'up') => {
        window.dispatchEvent(new CustomEvent('agent-qi-preview-escape', {
            detail: {
                phase,
                channelId: props.channelId || ''
            }
        }))
    }

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        dispatchEscapeEvent('down')
    }

    const handleKeyUp = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        dispatchEscapeEvent('up')
    }

    win.addEventListener('keydown', handleKeyDown, true)
    win.addEventListener('keyup', handleKeyUp, true)
    doc.addEventListener('keydown', handleKeyDown, true)
    doc.addEventListener('keyup', handleKeyUp, true)

    cleanupIframeKeyListeners = () => {
        win.removeEventListener('keydown', handleKeyDown, true)
        win.removeEventListener('keyup', handleKeyUp, true)
        doc.removeEventListener('keydown', handleKeyDown, true)
        doc.removeEventListener('keyup', handleKeyUp, true)
    }
}

function updateContent() {
    const iframe = iframeRef.value
    if (!iframe) return
    
    const doc = iframe.contentDocument
    if (!doc) return
    
    doc.open()
    doc.write(props.srcdoc || props.html)
    doc.close()

    requestAnimationFrame(() => {
        attachIframeKeyBridge()
    })
}

const handleWindowMessage = (event: MessageEvent) => {
    if (!props.channelId) return
    if (event.source !== iframeRef.value?.contentWindow) return
    const data = event.data
    if (!data || data.source !== 'agent-qi-sandbox' || data.channelId !== props.channelId) return
    emit('sandboxEvent', data)
}

onMounted(() => {
    window.addEventListener('message', handleWindowMessage)
    updateContent()
})

onBeforeUnmount(() => {
    window.removeEventListener('message', handleWindowMessage)
    cleanupKeyBridge()
})

watch(() => [props.html, props.srcdoc], updateContent)
</script>

<style scoped>
.preview-wrapper {
    width: 100%;
    height: 100%;
    min-height: inherit;
}

iframe {
    width: 100%;
    height: 100%;
    min-height: inherit;
    border: none;
    display: block;
}
</style>
