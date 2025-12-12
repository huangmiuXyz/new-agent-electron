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
        <div class="suggestions-card" :class="{ 'is-collapsed': isCollapsed }">
            <div class="suggestions-header" @click="toggleCollapse">
                <div class="suggestions-info">
                    <div class="icon-wrapper">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <span class="suggestions-title">{{ suggestionsData?.title || '建议' }}</span>
                    <span class="suggestions-count" v-if="suggestionsData?.suggestions?.length">
                        {{ suggestionsData?.suggestions?.length }}
                    </span>
                </div>
                <div class="suggestions-toggle">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                        class="toggle-icon">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            </div>
            <div class="suggestions-wrapper">
                <div class="suggestions-content">
                    <div class="suggestions-list">
                        <button v-for="suggestion in suggestionsData?.suggestions" :key="suggestion.id"
                            class="suggestion-item" :class="{ 'selected': selectedSuggestion === suggestion.id }"
                            @click="handleSuggestionSelected(suggestion)">
                            <span class="suggestion-text">{{ suggestion.text }}</span>
                            <span v-if="suggestion.action" class="suggestion-arrow">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 变量定义：方便统一调整颜色 */
.suggestions-card {
    --bg-color: #ffffff;
    --border-color: #eef2f6;
    /* 极淡的边框 */
    --hover-bg: #f8fafc;
    --text-primary: #1e293b;
    --text-secondary: #64748b;
    --accent-color: #3b82f6;
    /* 主题蓝 */
    --accent-bg: #eff6ff;
    --radius: 8px;
    --shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.msg-row {
    display: flex;
    padding: 8px 0;
    justify-content: flex-start;
    width: 100%;
}

.suggestions-card {
    width: 100%;
    background-color: var(--bg-color);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif;
}

.suggestions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    cursor: pointer;
    background: transparent;
    user-select: none;
}

.suggestions-header:hover {
    background-color: var(--hover-bg);
}

.suggestions-info {
    display: flex;
    align-items: center;
    gap: 8px;
}

.icon-wrapper {
    color: var(--accent-color);
    display: flex;
    align-items: center;
    justify-content: center;
}

.suggestions-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.01em;
}

.suggestions-count {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
    background-color: var(--hover-bg);
    padding: 1px 6px;
    border-radius: 99px;
}

.suggestions-toggle {
    color: var(--text-secondary);
    display: flex;
    align-items: center;
}

.suggestions-card.is-collapsed .toggle-icon {
    transform: rotate(-90deg);
}

.suggestions-wrapper {
    display: grid;
    grid-template-rows: 1fr;
}

.suggestions-card.is-collapsed .suggestions-wrapper {
    grid-template-rows: 0fr;
}

.suggestions-content {
    overflow: hidden;
    background-color: var(--bg-color);
}

/* List & Items */
.suggestions-list {
    padding: 4px 6px 6px 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
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
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: var(--text-primary);
    font-size: 13px;
    line-height: 1.5;
}

.suggestion-item:hover {
    background-color: var(--hover-bg);
    color: var(--text-primary);
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
    color: var(--text-secondary);
    opacity: 0;
    transform: translateX(-4px);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
}


.suggestions-list::-webkit-scrollbar {
    width: 4px;
}
</style>