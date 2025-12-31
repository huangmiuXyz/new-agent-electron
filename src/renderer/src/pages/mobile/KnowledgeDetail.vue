<script setup lang="ts">
const route = useRoute()
const { setTitle } = useAppHeader()
const knowledgeStore = useKnowledgeStore()

watch(() => route.params.id, (newId) => {
    if (newId) {
        localStorage.setItem('activeKnowledgeBaseId', newId as string)
        const kb = knowledgeStore.knowledgeBases.find(k => k.id === newId)
        if (kb && setTitle) {
            setTitle(kb.name)
        }
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
    background: var(--bg-card);
}
</style>
