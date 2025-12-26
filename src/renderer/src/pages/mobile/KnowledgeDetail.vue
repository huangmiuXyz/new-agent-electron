<script setup lang="ts">
const route = useRoute()

watch(() => route.params.id, (newId) => {
    if (newId) {
        localStorage.setItem('activeKnowledgeBaseId', newId as string)
    }
}, { immediate: true })

</script>

<template>
    <div class="mobile-knowledge-detail">
        <SettingsKnowledge />
    </div>
</template>

<style scoped>
.mobile-knowledge-detail {
    width: 100%;
    height: 100%;
    background: #fff;
}
</style>
