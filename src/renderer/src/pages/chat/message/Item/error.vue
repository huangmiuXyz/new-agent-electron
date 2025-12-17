<template>
    <div class="ai-error-line">
        <div class="error-icon">
            <ErrorCircle24Filled />
        </div>
        <span class="error-text">{{ error.message }}</span>
    </div>
</template>

<script lang="ts" setup>
defineProps<{
    error: Error
}>()

const { ErrorCircle24Filled } = useIcon(['ErrorCircle24Filled'])
</script>

<style scoped>
.ai-error-line {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    max-width: 100%;
    padding: 6px 12px;
    margin: 8px 0;
    border-radius: 6px;
    background-color: rgba(254, 226, 226, 0.4);
    border: 1px solid rgba(239, 68, 68, 0.2);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #dc2626;
    animation: slideIn 0.3s ease-out forwards;
}

.error-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #ef4444;
    width: 14px;
    height: 14px;
}

.error-icon svg {
    width: 100%;
    height: 100%;
}

.error-text {
    font-weight: 500;
    letter-spacing: 0.01em;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(2px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>