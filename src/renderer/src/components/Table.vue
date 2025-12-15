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

<script setup lang="ts" generic="T extends Record<string, any>">
const props = defineProps<{
    columns: Array<{ key: string; label: string; width?: string; headerClass?: string }>;
    data: Array<T>;
    loading?: boolean;
}>();

const emit = defineEmits(['row-click']);

const gridTemplate = computed(() => {
    return props.columns.map(col => col.width || '1fr').join(' ');
});
</script>

<style scoped>
.table-wrapper {
    border: 1px solid #eaeaea;
    border-radius: 10px;
    overflow: hidden;
    background: #ffffff;
    display: flex;
    flex-direction: column;
}

.table-header,
.table-row {
    display: grid;
    align-items: center;
    padding: 0 16px;
    gap: 16px;
}

.table-header {
    height: 40px;
    background: #fcfcfc;
    border-bottom: 1px solid #eaeaea;
    font-size: 11px;
    font-weight: 600;
    color: #86868b;
}

.table-row {
    height: 35px;
    border-bottom: 1px solid #eaeaea;
    font-size: 13px;
    color: #1d1d1f;
    transition: background 0.15s;
}

.table-row:last-child {
    border-bottom: none;
}

.table-row:hover {
    background: #fafafa;
}

.table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

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