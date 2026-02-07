<template>
    <div class="preview-wrapper">
        <iframe ref="iframeRef" sandbox="allow-scripts allow-same-origin" frameborder="0"></iframe>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

const props = defineProps<{
    html: string
}>()

const iframeRef = ref<HTMLIFrameElement>()

function updateContent() {
    const iframe = iframeRef.value
    if (!iframe) return
    
    const doc = iframe.contentDocument
    if (!doc) return
    
    doc.open()
    doc.write(props.html)
    doc.close()
}

onMounted(updateContent)
watch(() => props.html, updateContent)
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
