<template>
    <div class="preview-wrapper">
        <iframe ref="iframeRef" sandbox="allow-scripts allow-same-origin" frameborder="0"></iframe>
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

function updateContent() {
    const iframe = iframeRef.value
    if (!iframe) return
    
    const doc = iframe.contentDocument
    if (!doc) return
    
    doc.open()
    doc.write(props.srcdoc || props.html)
    doc.close()
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
