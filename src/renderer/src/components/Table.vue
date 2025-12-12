<template>
    <div class="table-wrapper">
        <!-- 表头 -->
        <div class="table-header" :style="{ gridTemplateColumns: gridTemplate }">
            <div v-for="col in columns" :key="col.key" class="header-cell" :class="col.headerClass">
                {{ col.label }}
            </div>
        </div>

        <!-- 数据行 -->
        <div class="table-body">
            <!-- 加载中状态 -->
            <div v-if="loading" class="state-row">
                <i class="ph ph-spinner spin"></i> Loading...
            </div>

            <div v-else-if="!data || data.length === 0" class="state-row">
                无数据
            </div>

            <template v-else>
                <div v-for="(row, rowIndex) in data" :key="row.id || rowIndex" class="table-row"
                    :style="{ gridTemplateColumns: gridTemplate }" @click="$emit('row-click', row)">
                    <div v-for="col in columns" :key="col.key" class="table-cell">
                        <!-- 优先使用具名插槽 (例如 #status="{ row }") -->
                        <slot :name="col.key" :row="row" :index="rowIndex">
                            <!-- 默认渲染文本 -->
                            {{ row[col.key] }}
                        </slot>
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    // 列定义：[{ key: 'name', label: 'Name', width: '3fr' }, ...]
    columns: {
        type: Array,
        required: true,
        default: () => []
    },
    // 数据源
    data: {
        type: Array,
        default: () => []
    },
    loading: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['row-click']);

// 动态生成 Grid 列宽配置
const gridTemplate = computed(() => {
    return props.columns.map(col => col.width || '1fr').join(' ');
});
</script>

<style scoped>
/* 引入 Phosphor Icons (如果全局未引入，可以在这里 import 或者在 index.html 引入) */

:root {
    --border-subtle: #eaeaea;
    --text-secondary: #86868b;
    --bg-hover: #fafafa;
}

.table-wrapper {
    border: 1px solid #eaeaea;
    /* var(--border-subtle) */
    border-radius: 10px;
    /* var(--radius-md) */
    overflow: hidden;
    background: #ffffff;
    display: flex;
    flex-direction: column;
}

/* 通用 Grid 布局控制 */
.table-header,
.table-row {
    display: grid;
    align-items: center;
    padding: 0 16px;
    gap: 16px;
    /* 列之间的间距 */
}

/* 表头样式 */
.table-header {
    height: 40px;
    /* 原设计看起来比较紧凑 */
    background: #fcfcfc;
    border-bottom: 1px solid #eaeaea;
    font-size: 11px;
    font-weight: 600;
    color: #86868b;
    /* var(--text-secondary) */
}

/* 行样式 */
.table-row {
    height: 64px;
    /* 根据截图内容调整高度 */
    border-bottom: 1px solid #eaeaea;
    font-size: 13px;
    color: #1d1d1f;
    /* var(--text-primary) */
    transition: background 0.15s;
}

.table-row:last-child {
    border-bottom: none;
}

.table-row:hover {
    background: #fafafa;
}

/* 单元格默认样式 */
.table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 状态行（空/加载） */
.state-row {
    padding: 40px;
    text-align: center;
    color: #86868b;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

/* 简单动画 */
.spin {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    100% {
        transform: rotate(360deg);
    }
}
</style>