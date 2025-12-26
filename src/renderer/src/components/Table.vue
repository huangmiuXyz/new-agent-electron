<template>
  <div class="table-wrapper" :style="{ gridTemplateColumns: gridTemplate }">
    <!-- 表头行 -->
    <div class="table-header">
      <div v-for="col in columns" :key="col.key" class="header-cell" :class="col.headerClass">
        {{ col.label }}
      </div>
    </div>

    <!-- 表体 -->
    <div class="table-body">
      <!-- 加载中 -->
      <div v-if="loading" class="state-row">Loading...</div>

      <!-- 空状态 -->
      <div v-else-if="!data || data.length === 0" class="state-row">无数据</div>

      <!-- 数据行 -->
      <template v-else>
        <div
          v-for="(row, rowIndex) in data"
          :key="row.id || rowIndex"
          class="table-row"
          @click="$emit('row-click', row)"
        >
          <div v-for="col in columns" :key="col.key" class="table-cell">
            <slot :name="col.key" :row="row" :index="rowIndex">
              {{ row[col.key] }}
            </slot>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts" generic="T extends Record<string, any>">
import { computed } from 'vue'

const props = defineProps<{
  columns: Array<{
    key: string
    label: string
    width?: string | number // number => px
    headerClass?: string
  }>
  data: Array<T>
  loading?: boolean
}>()

defineEmits(['row-click'])

const gridTemplate = computed(() =>
  props.columns
    .map((col) => (typeof col.width === 'number' ? `${col.width}px` : col.width || '1fr'))
    .join(' ')
)
</script>

<style scoped>
.table-wrapper {
  display: grid;
  grid-auto-rows: auto;
  border: 1px solid #eaeaea;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  overflow-x: auto;
}

.table-header,
.table-row {
  display: contents;
}

.table-body {
  display: contents;
}

.header-cell,
.table-cell {
  box-sizing: border-box;
  padding: 0 8px;
  height: 36px;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  border-bottom: 1px solid #eaeaea;
}

/* 表头样式 */
.header-cell {
  font-size: 11px;
  font-weight: 600;
  color: #86868b;
  background: #fcfcfc;
}

.table-cell {
  font-size: 13px;
  color: #1d1d1f;
}

.table-row:hover .table-cell {
  background: #fafafa;
}

.state-row {
  grid-column: 1 / -1;
  padding: 40px;
  text-align: center;
  color: #86868b;
}
</style>
