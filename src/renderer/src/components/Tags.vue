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
    background-color: #f0f7ff;
    color: #0066cc;
}

.tag-green {
    background-color: #eafbf0;
    color: #1a7f37;
}

.tag-orange {
    background-color: #fff8eb;
    color: #9a6602;
}

.tag-red {
    background-color: #fef2f2;
    color: #d93025;
}

.tag-purple {
    background-color: #f5f3ff;
    color: #7c3aed;
}

.tag-gray {
    background-color: #f3f4f6;
    color: #4b5563;
}

.empty-placeholder {
    font-size: 12px;
    color: #86868b;
    font-style: normal;
}
</style>