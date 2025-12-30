<template>
    <div class="ai-error-compact">
        <div class="icon-wrapper">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
        </div>

        <span class="message-text">{{ error.message }}</span>

        <div class="divider"></div>

        <button class="retry-btn" @click="$emit('retry')" title="点击重试">
            <svg class="retry-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
            </svg>
            <span>重试</span>
        </button>
    </div>
</template>

<script lang="ts" setup>
defineProps<{
    error: Error
}>()

defineEmits<{
    (e: 'retry'): void
}>()
</script>

<style scoped>
.ai-error-compact {
    display: inline-flex;
    align-items: center;
    padding: 5px 10px 5px 8px;
    margin: 6px 0;
    max-width: 100%;
    box-sizing: border-box;

    background-color: var(--bg-error, rgba(254, 242, 242, 0.9));
    border: 1px solid var(--border-error, rgba(252, 165, 165, 0.6));
    border-radius: 6px;

    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    color: var(--color-danger);

    transition: all 0.2s ease;
    user-select: none;
}

.icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-danger);
    width: 16px;
    height: 16px;
    margin-right: 6px;
    flex-shrink: 0;
}

.icon-wrapper svg {
    width: 100%;
    height: 100%;
    display: block;
}

.message-text {
    font-weight: 500;
    color: var(--color-danger);
    margin-right: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
}

.divider {
    width: 1px;
    height: 10px;
    background-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.3);
    margin-right: 6px;
}

.retry-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    background: none;
    border: none;
    padding: 2px 4px;
    cursor: pointer;
    color: var(--color-danger);
    font-size: 12px;
    font-weight: 600;
    border-radius: 4px;
    transition: all 0.2s;
    line-height: 1;
}

.retry-btn:hover {
    background-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.1);
}

.retry-btn:hover .retry-icon {
    transform: rotate(180deg);
}

.retry-icon {
    width: 11px;
    height: 11px;
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    color: var(--color-danger);
}

/* 深色模式 */
.dark-mode .ai-error-compact {
    background-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.15);
    border-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.3);
}

.dark-mode .icon-wrapper {
    color: var(--color-danger);
}

.dark-mode .message-text {
    color: var(--color-danger);
}

.dark-mode .divider {
    background-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.3);
}

.dark-mode .retry-btn {
    color: var(--color-danger);
}

.dark-mode .retry-icon {
    color: var(--color-danger);
}

.dark-mode .retry-btn:hover {
    background-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.2);
    color: var(--accent-text);
}
</style>