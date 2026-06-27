<script setup lang="ts">
import { chatRepository } from '@renderer/services/chatRepository'
import { useDebounceFn } from '@vueuse/core'
import { acquireZIndex } from '@renderer/utils/z-index-manager'

interface SearchResult {
    id: string
    chatId: string
    chatTitle: string
    messageId: string
    content: string
    logo: string
    modelName: string
    isHuman: boolean
    date: string
}

const props = defineProps<{
    modelValue: boolean
}>()

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    'select': [item: SearchResult]
}>()

const searchInputRef = useTemplateRef('searchInputRef')
const zIndex = acquireZIndex()
const query = ref('')
const selectedIndex = ref(0)
const scrollContainer = ref<HTMLElement | null>(null)

const chatsStore = useChatsStores()
const { scrollToMessage } = useMessageScroll()
const settings = useSettingsStore()

const providerLogoMap = computed(() => {
    const map = new Map<string, string>()
    settings.providers.forEach(p => {
        if (p.id && p.logo) map.set(p.id, p.logo)
    })
    return map
})

const searchResults = ref<SearchResult[]>([])
const isSearching = ref(false)

const performSearch = useDebounceFn(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) {
        searchResults.value = []
        return
    }
    isSearching.value = true
    try {
        const lowerQuery = trimmed.toLowerCase()
        const results: SearchResult[] = []
        const MAX_RESULTS = 50
        const summaries = chatsStore.chatSummaries

        const messagesByChat = await Promise.all(
            summaries.map(async (summary) => ({
                summary,
                messages: await chatRepository.loadAllMessages(summary.id)
            }))
        )

        for (const { summary, messages } of messagesByChat) {
            if (results.length >= MAX_RESULTS) break
            const chatTitle = summary.title || ''
            const lowerChatTitle = chatTitle.toLowerCase()
            const chatTitleMatches = lowerChatTitle.includes(lowerQuery)

            for (const message of messages) {
                if (results.length >= MAX_RESULTS) break
                const contentText = message.parts
                    .filter(block => block.type === 'text')
                    .map(block => (block as any).text || '')
                    .join('')
                const lowerContent = contentText.toLowerCase()
                const contentMatches = lowerContent.includes(lowerQuery)

                if (chatTitleMatches || contentMatches) {
                    const metadata = message.metadata
                    results.push({
                        id: `${summary.id}-${message.id}`,
                        chatId: summary.id,
                        chatTitle,
                        messageId: message.id!,
                        content: contentText,
                        logo: providerLogoMap.value.get(metadata?.provider || '') || '',
                        modelName: metadata?.model || '未知模型',
                        isHuman: message.role === 'user',
                        date: new Date(metadata?.date || summary.createdAt).toLocaleDateString()
                    })
                }
            }
        }

        searchResults.value = results
    } finally {
        isSearching.value = false
    }
}, 300)

watch(query, (val) => performSearch(val))

const close = () => emit('update:modelValue', false)

useBackButton({
    enabled: computed(() => props.modelValue),
    handler: () => {
        close()
        return true
    }
})

watch(() => props.modelValue, (val) => {
    if (val) {
        query.value = ''
        selectedIndex.value = 0
        nextTick(() => searchInputRef.value?.focus())
    }
})

const handleKeydown = (e: KeyboardEvent) => {
    if (!props.modelValue) return

    const listLen = searchResults.value.length

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault()
            selectedIndex.value = (selectedIndex.value + 1) % listLen
            scrollToActive()
            break
        case 'ArrowUp':
            e.preventDefault()
            selectedIndex.value = (selectedIndex.value - 1 + listLen) % listLen
            scrollToActive()
            break
        case 'Enter':
            e.preventDefault()
            if (listLen > 0) handleSelect(searchResults.value[selectedIndex.value]!)
            break
        case 'Escape':
            e.preventDefault()
            close()
            break
    }
}

const scrollToActive = () => {
    nextTick(() => {
        const activeEl = scrollContainer.value?.querySelector('.result-item.active') as HTMLElement
        if (activeEl && scrollContainer.value) {
            const wrapperHeight = scrollContainer.value.clientHeight
            const itemTop = activeEl.offsetTop
            const itemHeight = activeEl.clientHeight
            const scrollTop = scrollContainer.value.scrollTop

            if (itemTop < scrollTop) {
                scrollContainer.value.scrollTop = itemTop
            } else if (itemTop + itemHeight > scrollTop + wrapperHeight) {
                scrollContainer.value.scrollTop = itemTop + itemHeight - wrapperHeight
            }
        }
    })
}

const handleSelect = (item: SearchResult) => {
    scrollToMessage(item.messageId)
    chatsStore.setActiveChat(item.chatId)
    emit('select', item)
    close()
}

const highlightRegex = computed(() => {
    const q = query.value.trim()
    if (!q) return null
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(${escaped})`, 'gi')
})

const highlightText = (text: string) => {
    if (!text || !highlightRegex.value) return text
    return text.replace(highlightRegex.value, '<span class="highlight">$1</span>')
}
</script>

<template>
    <Teleport to="body">
        <Transition name="modal-fade">
            <div v-if="modelValue" class="modal-overlay" :style="{ zIndex }" @click="close">
                <div class="modal-content" @click.stop @keydown="handleKeydown">
                    <div class="search-header">
                        <SearchInput ref="searchInputRef" v-model="query" placeholder="搜索聊天记录" size="md"
                            variant="minimal" :show-icon="true" :debounce="200" class="global-search-input" />
                        <div class="shortcut-hint">ESC</div>
                    </div>

                    <div class="results-container" ref="scrollContainer">
                        <div v-if="isSearching" class="empty-state">
                            搜索中...
                        </div>

                        <div v-else-if="searchResults.length === 0 && query" class="empty-state">
                            没有找到相关结果
                        </div>

                        <div v-else-if="!query" class="empty-state">
                            输入关键词开始搜索
                        </div>

                        <div v-for="(item, index) in searchResults" :key="item.id" class="result-item"
                            :class="{ active: index === selectedIndex }" @click="handleSelect(item)"
                            @mouseenter="selectedIndex = index">
                            <div class="model-avatar">
                                <Image v-if="!item.isHuman && item.logo" :src="item.logo" :alt="item.modelName"
                                    class="model-logo" />
                                <div v-else class="avatar-placeholder" :class="{ 'user-avatar': item.isHuman }">
                                    {{ item.isHuman ? '用' : item.modelName.charAt(0).toUpperCase() }}
                                </div>
                            </div>
                            <div class="item-info">
                                <div class="item-top">
                                    <div class="title-container">
                                        <span class="item-name" v-html="highlightText(item.chatTitle)"></span>
                                        <span class="model-name" :class="{ 'user-name': item.isHuman }">
                                            {{ item.isHuman ? '用户' : item.modelName }}
                                        </span>
                                    </div>
                                    <span class="item-date">{{ item.date }}</span>
                                </div>
                                <div class="item-msg" v-html="highlightText(item.content)"></div>
                            </div>
                            <div v-if="index === selectedIndex" class="enter-hint">↵</div>
                        </div>
                    </div>

                    <div class="search-footer">
                        <span class="footer-item">
                            <kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd> 切换
                        </span>
                        <span class="footer-item">
                            <kbd class="kbd">↵</kbd> 选择
                        </span>
                        <span class="count" v-if="searchResults.length">
                            {{ searchResults.length }} 条结果
                        </span>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
    backdrop-filter: blur(2px);
}

.modal-content {
    width: 600px;
    max-width: 90vw;
    background: var(--bg-card);
    border-radius: 12px;
    box-shadow: var(--shadow-xl);
    border: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.search-header {
    display: flex;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-color);
    gap: 12px;
}

.search-icon {
    width: 20px;
    height: 20px;
    color: var(--text-sub);
}

.global-search-input {
    flex: 1;
}

.global-search-input :deep(.search-input__field) {
    font-size: 16px;
    height: 24px;
    padding: 0;
}

.global-search-input :deep(.search-input__icon) {
    font-size: 20px;
    width: 20px;
    height: 20px;
}

.shortcut-hint {
    font-size: 11px;
    color: var(--text-sub);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 2px 6px;
}

.results-container {
    max-height: 400px;
    overflow-y: auto;
    padding: 8px;
}

.empty-state {
    padding: 40px;
    text-align: center;
    color: var(--text-sub);
    font-size: 14px;
}

.result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.1s ease;
    position: relative;
}

.result-item.active {
    background-color: var(--active-bg);
}

.model-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-hover);
}

.model-logo {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.avatar-placeholder {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--border-color-medium);
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    flex-shrink: 0;
}

.item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.item-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2px;
}

.title-container {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
}

.item-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-main);
}

.item-date {
    font-size: 11px;
    color: var(--text-sub);
    font-variant-numeric: tabular-nums;
}

.model-name {
    font-size: 11px;
    color: var(--accent-color);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
}

.user-name {
    color: var(--color-success);
}

.user-avatar {
    background: rgba(16, 185, 129, 0.15);
    color: var(--color-success);
}

.item-msg {
    font-size: 13px;
    color: var(--text-sub);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
}

:deep(.highlight) {
    color: var(--accent-text);
    font-weight: 600;
    background: rgba(var(--accent-rgb), 0.1);
    padding: 0 1px;
    border-radius: 2px;
}

.enter-hint {
    font-size: 14px;
    color: var(--text-sub);
    padding-right: 4px;
}

.search-footer {
    padding: 8px 16px;
    background: var(--bg-hover);
    border-top: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 11px;
    color: var(--text-sub);
}

.footer-item {
    display: flex;
    align-items: center;
    gap: 4px;
}

.kbd {
    background: var(--bg-input);
    border: 1px solid var(--border-color-light);
    border-radius: 3px;
    padding: 1px 4px;
    font-family: inherit;
    min-width: 16px;
    text-align: center;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
}

.count {
    margin-left: auto;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
    transition: opacity var(--motion-duration-fast) var(--motion-ease-standard), transform var(--motion-duration-fast) var(--motion-ease-standard);
}

.modal-fade-enter-active .modal-content {
    transition: transform var(--motion-duration-normal) var(--motion-ease-decelerated);
}

.modal-fade-leave-active .modal-content {
    transition: transform var(--motion-duration-fast) var(--motion-ease-standard);
}

.modal-fade-enter-from,
.modal-fade-leave-to {
    opacity: 0;
}

.modal-fade-enter-from .modal-content {
    transform: scale(0.96) translateY(10px);
}

.modal-fade-leave-to .modal-content {
    transform: scale(0.98);
}
</style>
