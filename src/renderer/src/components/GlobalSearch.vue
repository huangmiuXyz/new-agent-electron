<script setup lang="ts">
interface SearchResult {
    id: string
    chatId: string
    chatTitle: string // 聊天标题
    messageId: string // 消息ID
    content: string // 消息内容
    logo: string // 消息来源logo
    modelName: string // 模型名称
    isHuman: boolean // 是否为用户消息
    date: string // 时间
}

const props = defineProps<{
    modelValue: boolean // 控制显示隐藏 v-model
}>()

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    'select': [item: SearchResult]
}>()

const searchInput = ref<HTMLInputElement | null>(null)
const query = ref('')
const selectedIndex = ref(0)
const scrollContainer = ref<HTMLElement | null>(null)

// 获取聊天存储
const chatsStore = useChatsStores()

// 生成搜索结果数据
const searchData = computed(() => {
    const results: SearchResult[] = []

    // 遍历所有聊天
    chatsStore.chats.forEach(chat => {
        // 遍历每个聊天的消息
        chat.messages.forEach(message => {
            // 处理消息内容，可能是字符串或ContentBlock数组
            let contentText = ''
            if (message.content) {
                if (typeof message.content === 'string') {
                    contentText = message.content
                } else if (Array.isArray(message.content)) {
                    // 处理ContentBlock数组
                    contentText = message.content
                        .filter(block => block.type === 'text')
                        .map(block => (block as any).text || '')
                        .join('')
                }
            }
            const additional_kwargs = message.additional_kwargs as unknown as Additional_kwargs
            // 只搜索有内容的消息
            if (contentText.trim()) {
                results.push({
                    id: `${chat.id}-${message.id}`,
                    chatId: chat.id,
                    chatTitle: chat.title,
                    messageId: message.id!,
                    content: contentText,
                    logo: additional_kwargs.provider?.logo,
                    modelName: additional_kwargs.model?.name || '未知模型',
                    isHuman: message.getType() === 'human',
                    date: new Date(additional_kwargs?.time || chat.createdAt).toLocaleDateString()
                })
            }
        })
    })

    return results
})

// 简单的模糊搜索 + 高亮处理
const filteredResults = computed(() => {
    if (!query.value.trim()) return []

    const lowerQuery = query.value.toLowerCase()
    return searchData.value.filter(item =>
        item.content.toLowerCase().includes(lowerQuery) ||
        item.chatTitle.toLowerCase().includes(lowerQuery)
    )
})

// 监听弹窗打开，自动聚焦并重置状态
watch(() => props.modelValue, (val) => {
    if (val) {
        query.value = ''
        selectedIndex.value = 0
        nextTick(() => searchInput.value?.focus())
    }
})

// 关闭弹窗
const close = () => emit('update:modelValue', false)

// 键盘导航
const handleKeydown = (e: KeyboardEvent) => {
    if (!props.modelValue) return

    const listLen = filteredResults.value.length

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
            if (listLen > 0) handleSelect(filteredResults.value[selectedIndex.value]!)
            break
        case 'Escape':
            e.preventDefault()
            close()
            break
    }
}

// 自动滚动到选中项
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
    // 设置当前活动聊天
    chatsStore.setActiveChat(item.chatId)
    emit('select', item)
    close()
}

// 关键词高亮渲染
const highlightText = (text: string) => {
    if (!query.value) return text
    const reg = new RegExp(`(${query.value})`, 'gi')
    return text.replace(reg, '<span class="highlight">$1</span>')
}

// 全局快捷键 Cmd/Ctrl + K
const handleGlobalKeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        emit('update:modelValue', !props.modelValue)
    }
}

onMounted(() => window.addEventListener('keydown', handleGlobalKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleGlobalKeydown))
</script>

<template>
    <Teleport to="body">
        <Transition name="modal-fade">
            <div v-if="modelValue" class="modal-overlay" @click="close">
                <div class="modal-content" @click.stop @keydown="handleKeydown">

                    <!-- 搜索头部 -->
                    <div class="search-header">
                        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input ref="searchInput" v-model="query" class="search-input" placeholder="搜索聊天记录、联系人..."
                            type="text" />
                        <div class="shortcut-hint">ESC</div>
                    </div>

                    <!-- 结果列表 -->
                    <div class="results-container" ref="scrollContainer">
                        <div v-if="filteredResults.length === 0 && query" class="empty-state">
                            没有找到相关结果
                        </div>

                        <div v-else-if="!query" class="empty-state">
                            输入关键词开始搜索
                        </div>

                        <div v-for="(item, index) in filteredResults" :key="item.id" class="result-item"
                            :class="{ active: index === selectedIndex }" @click="handleSelect(item)"
                            @mouseenter="selectedIndex = index">
                            <div class="model-avatar">
                                <img v-if="!item.isHuman && item.logo" :src="item.logo" :alt="item.modelName"
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

                    <!-- 底部状态栏 -->
                    <div class="search-footer">
                        <span class="footer-item">
                            <kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd> 切换
                        </span>
                        <span class="footer-item">
                            <kbd class="kbd">↵</kbd> 选择
                        </span>
                        <span class="count" v-if="filteredResults.length">
                            {{ filteredResults.length }} 条结果
                        </span>
                    </div>

                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
/* 遮罩层 */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    /* 偏上显示 */
    padding-top: 12vh;
    z-index: 9999;
    backdrop-filter: blur(2px);
}

/* 弹窗主体 */
.modal-content {
    width: 600px;
    max-width: 90vw;
    background: #fff;
    border-radius: 12px;
    box-shadow: var(--shadow-xl);
    border: 1px solid rgba(255, 255, 255, 0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* 搜索头 */
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

.search-input {
    flex: 1;
    background: transparent;
    border: none;
    font-size: 16px;
    color: var(--text-main);
    outline: none;
    height: 24px;
}

.search-input::placeholder {
    color: #9ca3af;
}

.shortcut-hint {
    font-size: 11px;
    color: var(--text-sub);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 2px 6px;
}

/* 结果列表 */
.results-container {
    max-height: 400px;
    overflow-y: auto;
    padding: 8px;
}

/* 自定义滚动条 */
.results-container::-webkit-scrollbar {
    width: 6px;
}

.results-container::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 3px;
}

.empty-state {
    padding: 40px;
    text-align: center;
    color: var(--text-sub);
    font-size: 14px;
}

/* 列表项 */
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

/* 模型头像容器 */
.model-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f4f6;
}

.model-logo {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* 头像占位 */
.avatar-placeholder {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #e5e7eb;
    color: #6b7280;
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
    color: #3b82f6;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
}

.user-name {
    color: #10b981;
}

.user-avatar {
    background: #d1fae5;
    color: #10b981;
}

.item-msg {
    font-size: 13px;
    color: var(--text-sub);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
}

/* 高亮样式 (需要 deep 选择器或全局样式) */
:deep(.highlight) {
    color: var(--accent);
    font-weight: 600;
    background: rgba(59, 130, 246, 0.1);
    padding: 0 1px;
    border-radius: 2px;
}

.enter-hint {
    font-size: 14px;
    color: var(--text-sub);
    padding-right: 4px;
}

/* 底部 */
.search-footer {
    padding: 8px 16px;
    background: rgba(249, 250, 251, 0.8);
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
    background: white;
    border: 1px solid #e5e7eb;
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

/* ==================
   动画 (Snappy & Clean)
   ================== */
.modal-fade-enter-active,
.modal-fade-leave-active {
    transition: opacity 0.15s ease, transform 0.15s ease;
}

/* 使用弹簧效果或 Expo 曲线避免拖拉 */
.modal-fade-enter-active .modal-content {
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-leave-active .modal-content {
    transition: transform 0.15s ease-in;
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