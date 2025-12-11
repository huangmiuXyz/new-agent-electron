<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
    suggestionsData: SuggestionsData;
}>();

const emit = defineEmits<{
    suggestionSelected: [suggestion: Suggestion];
}>();

const isCollapsed = ref(false);
const selectedSuggestion = ref<string | null>(null);

const toggleCollapse = () => {
    isCollapsed.value = !isCollapsed.value;
};

const { currentChat } = storeToRefs(useChatsStores());
const handleSuggestionSelected = (suggestion: any) => {
    if (!currentChat.value) return
    const { sendMessages } = useChat(currentChat.value.id)
    sendMessages(suggestion.text)
}
</script>

<template>
    <div class="msg-row suggestions-row">
        <div class="suggestions-card">
            <div class="suggestions-header" @click="toggleCollapse">
                <div class="suggestions-info">
                    <div class="suggestions-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 11l3 3L22 4" />
                            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                        </svg>
                    </div>
                    <span class="suggestions-title">{{ suggestionsData?.title }}</span>
                    <span class="suggestions-count">({{ suggestionsData?.suggestions.length }})</span>
                </div>
                <div class="suggestions-toggle">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                        :class="{ 'rotated': !isCollapsed }">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            </div>
            <div class="suggestions-content" :class="{ 'collapsed': isCollapsed }">
                <div class="suggestions-list">
                    <div v-for="suggestion in suggestionsData?.suggestions" :key="suggestion.id" class="suggestion-item"
                        :class="{ 'selected': selectedSuggestion === suggestion.id }"
                        @click="handleSuggestionSelected(suggestion)">
                        <div class="suggestion-text">{{ suggestion.text }}</div>
                        <div v-if="suggestion.action" class="suggestion-action">{{ suggestion.action }}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.msg-row {
    display: flex;
    padding: 4px 0px;
    justify-content: flex-start;
}

.suggestions-card {
    width: 100%;
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    transition: box-shadow 0.2s;
}

.suggestions-card:hover {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.04);
}

.suggestions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background-color: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
    cursor: pointer;
    user-select: none;
}

.suggestions-info {
    display: flex;
    align-items: center;
    gap: 8px;
}

.suggestions-icon {
    color: #3b82f6;
    display: flex;
    align-items: center;
}

.suggestions-title {
    font-size: 13px;
    font-weight: 600;
    color: #334155;
}

.suggestions-count {
    font-size: 11px;
    color: #64748b;
    background-color: #e2e8f0;
    padding: 2px 6px;
    border-radius: 10px;
}

.suggestions-toggle {
    color: #64748b;
    transition: transform 0.2s;
}

.suggestions-toggle svg {
    transition: transform 0.2s;
}

.suggestions-toggle svg.rotated {
    transform: rotate(180deg);
}

.suggestions-content {
    padding: 0;
    max-height: 300px;
    overflow-y: auto;
    transition: max-height 0.2s ease-in-out;
}

.suggestions-content.collapsed {
    max-height: 0;
}

.suggestions-list {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.suggestion-item {
    padding: 10px 12px;
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
}

.suggestion-item:hover {
    background-color: #f8fafc;
    border-color: #cbd5e1;
    transform: translateY(-1px);
}

.suggestion-item.selected {
    background-color: #dbeafe;
    border-color: #3b82f6;
}

.suggestion-text {
    font-size: 13px;
    line-height: 1.5;
    color: #334155;
    margin-bottom: 4px;
}

.suggestion-action {
    font-size: 11px;
    color: #64748b;
    font-style: italic;
}

/* Scrollbar styling */
.suggestions-content::-webkit-scrollbar {
    width: 6px;
}

.suggestions-content::-webkit-scrollbar-track {
    background: transparent;
}

.suggestions-content::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
}

.suggestions-content::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
}
</style>