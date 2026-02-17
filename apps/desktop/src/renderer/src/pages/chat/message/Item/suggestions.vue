<script setup lang="ts">

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

const handleSuggestionSelected = (suggestion: Suggestion) => {
    if (!currentChat.value) return
    selectedSuggestion.value = suggestion.id;
    const { sendMessages } = useChat(currentChat.value.id)
    sendMessages(suggestion.text)
}
</script>

<template>
    <div class="msg-row suggestions-row">
        <div class="suggestions-container" :class="{ 'is-expanded': !isCollapsed }">
            <div class="suggestions-header" @click="toggleCollapse">
                <div class="suggestions-info">
                    <div class="icon-wrapper">
                         <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <span class="suggestions-title">{{ suggestionsData?.title || 'Suggestions' }}</span>
                    <span class="suggestions-count" v-if="suggestionsData?.suggestions?.length">
                        {{ suggestionsData?.suggestions?.length }}
                    </span>
                </div>
                <div class="suggestions-toggle">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                        class="toggle-icon" :class="{ collapsed: isCollapsed }">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            </div>
            
            <div class="suggestions-content-wrapper" v-if="!isCollapsed">
                <div class="suggestions-list">
                    <button v-for="suggestion in suggestionsData?.suggestions" :key="suggestion.id"
                        class="suggestion-item" :class="{ 'selected': selectedSuggestion === suggestion.id }"
                        @click="handleSuggestionSelected(suggestion)">
                        <span class="suggestion-text">{{ suggestion.text }}</span>
                        <span v-if="suggestion.action" class="suggestion-arrow">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.msg-row {
    display: flex;
    padding: 1px 0;
    justify-content: flex-start;
    width: 100%;
}

.suggestions-container {
    width: 100%;
    border-radius: 4px;
    transition: all 0.2s;
    background: transparent;
    border: 1px solid transparent;
}

.suggestions-container.is-expanded {
    background-color: var(--bg-card);
    border-color: var(--border-color-light);
    margin-bottom: 4px;
}

.suggestions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 4px;
    cursor: pointer;
    user-select: none;
    border-radius: 4px;
    min-height: 20px;
}

.suggestions-header:hover {
    background-color: var(--bg-hover);
}

.suggestions-info {
    display: flex;
    align-items: center;
    gap: 6px;
}

.icon-wrapper {
    color: var(--accent-color);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.8;
}

.suggestions-title {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
    letter-spacing: -0.01em;
}

.suggestions-count {
    font-size: 9px;
    font-weight: 500;
    color: var(--text-tertiary);
    background-color: rgba(0,0,0,0.03);
    padding: 0px 4px;
    border-radius: 99px;
    min-width: 14px;
    text-align: center;
}

.suggestions-toggle {
    color: var(--text-tertiary);
    display: flex;
    align-items: center;
    padding-left: 4px;
}

.toggle-icon {
    transition: transform 0.2s ease;
}

.toggle-icon.collapsed {
    transform: rotate(-90deg);
}

.suggestions-content-wrapper {
    border-top: 1px solid var(--border-color-light);
    overflow: hidden;
}

/* List & Items */
.suggestions-list {
    padding: 2px 0;
    display: flex;
    flex-direction: column;
}

.suggestion-item {
    appearance: none;
    background: none;
    border: none;
    text-align: left;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    cursor: pointer;
    transition: all 0.1s ease;
    color: var(--text-primary);
    font-size: 11px;
    line-height: 1.4;
    border-left: 2px solid transparent;
}

.suggestion-item:hover {
    background-color: var(--bg-hover);
    border-left-color: var(--accent-color);
}

.suggestion-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.suggestion-arrow {
    margin-left: 8px;
    color: var(--text-tertiary);
    opacity: 0.5;
    display: flex;
    align-items: center;
}

.suggestion-item:hover .suggestion-arrow {
    opacity: 1;
    color: var(--accent-color);
}
</style>
