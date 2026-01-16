<template>
    <div v-html="html"></div>
</template>

<script setup lang="ts">
defineProps<{
    html: string
}>()
</script>

<style scoped>
div :deep(*) {
    max-width: 100%;
}
</style>
