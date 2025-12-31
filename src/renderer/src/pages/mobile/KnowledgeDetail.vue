<script setup lang="ts">
import AppHeader from '../../components/AppHeader.vue'
const route = useRoute()
const { setTitle, customTitle } = useAppHeader()
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
        <AppHeader :custom-title="customTitle" current-view="settings" mode="detail" />
        <div class="detail-content">
            <SettingsKnowledge />
        </div>
    </div>
</template>

<style scoped>
.mobile-knowledge-detail {
    width: 100%;
    height: 100%;
    background: var(--bg-card);
    display: flex;
    flex-direction: column;
}

.detail-content {
    flex: 1;
    overflow-y: auto;
}
</style>
