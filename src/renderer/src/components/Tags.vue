<template>
    <div class="tags-display-container">
        <template v-if="tags && tags.length > 0">
            <!-- 动态绑定颜色类名 -->
            <span v-for="(tag, index) in tags" :key="index" class="tag-badge" :class="`tag-${color}`">
                {{ tag }}
            </span>
        </template>

        <!-- 空状态 -->
        <span v-else class="empty-placeholder">
            {{ emptyText }}
        </span>
    </div>
</template>

<script setup lang="ts">
type BadgeColor = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray';

interface Props {
    tags: string[]
    emptyText?: string
    color?: BadgeColor
}

withDefaults(defineProps<Props>(), {
    tags: () => [],
    emptyText: '--',
    color: 'blue'
})
</script>

<style scoped>
.tags-display-container {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    width: 100%;
}

/* === 基础样式 (结构) === */
.tag-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 10px;
    height: 22px;

    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    border-radius: 10px;

    user-select: none;
    cursor: default;
    white-space: nowrap;
}

.tag-blue {
    background-color: rgba(var(--color-info-rgb, 59, 130, 246), 0.15);
    color: var(--color-info);
}

.tag-green {
    background-color: rgba(var(--color-success-rgb, 16, 185, 129), 0.15);
    color: var(--color-success);
}

.tag-orange {
    background-color: rgba(var(--color-warning-rgb, 245, 158, 11), 0.15);
    color: var(--color-warning);
}

.tag-red {
    background-color: rgba(var(--color-danger-rgb, 239, 68, 68), 0.15);
    color: var(--color-danger);
}

.tag-purple {
    background-color: rgba(124, 58, 237, 0.15);
    color: #7c3aed;
}

.tag-gray {
    background-color: var(--bg-hover);
    color: var(--text-secondary);
}

.empty-placeholder {
    font-size: 12px;
    color: var(--text-secondary);
    font-style: normal;
}
</style>