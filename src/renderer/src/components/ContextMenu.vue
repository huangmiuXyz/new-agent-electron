<template>
  <Teleport to="body">
    <transition name="radix-zoom">
      <div v-if="visible" ref="menuRef" class="radix-menu-content" :style="styleObject" @contextmenu.prevent>
        <template v-for="(item, index) in menuOptions" :key="index">

          <!-- 分割线 -->
          <div v-if="item.type === 'divider'" class="radix-separator"></div>

          <!-- 菜单项 -->
          <div v-else class="radix-item" :class="{ 'danger': item.danger, 'disabled': item.disabled }"
            @click="handleItemClick(item)">
            <!-- 左侧内容：图标 + 文字 -->
            <div class="radix-item-left">
              <component :is="item.icon" />
              <span>{{ item.label }}</span>
            </div>

            <!-- 右侧槽位：快捷键 -->
            <div class="radix-right-slot" v-if="item.shortcut">
              {{ item.shortcut }}
            </div>
          </div>

        </template>
      </div>
    </transition>
  </Teleport>

  <!-- 透明遮罩 -->
  <div v-if="visible" class="radix-overlay" @click="hideContextMenu" @contextmenu.prevent="hideContextMenu"></div>
</template>

<script setup lang="ts" generic="T">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useContextMenu, type MenuItem } from '../composables/useContextMenu';

const { visible, position, menuOptions, contextData, hideContextMenu } = useContextMenu<T>();
const menuRef = ref<HTMLElement | null>(null);
const adjustedPos = ref({ x: 0, y: 0 });
const transformOrigin = ref('top left');

// 如果配置项里有 handler 函数，直接执行
// 否则分发 select 事件给父组件
const emit = defineEmits(['select']);

const handleItemClick = (item: MenuItem<T>) => {
  if (item.disabled) return;

  // 1. 如果配置项自带 onClick 处理函数，优先执行
  if (typeof item.onClick === 'function') {
    item.onClick((contextData.value as T));
  } else {
    // 2. 否则通过 action 字符串通知父组件
    emit('select', { action: item.action, data: contextData.value });
  }

  hideContextMenu();
};

// 位置计算逻辑
const calculatePosition = async () => {
  await nextTick();
  if (!menuRef.value) return;

  const { offsetWidth: w, offsetHeight: h } = menuRef.value;
  const { innerWidth: winW, innerHeight: winH } = window;
  const { x, y } = position;

  let newX = x;
  let newY = y;
  let originX = 'left';
  let originY = 'top';

  if (x + w > winW) { newX = x - w; originX = 'right'; }
  if (y + h > winH) { newY = y - h; originY = 'bottom'; }

  adjustedPos.value = { x: newX, y: newY };
  transformOrigin.value = `${originY} ${originX}`;
};

watch(visible, (val) => { if (val) calculatePosition(); });

const styleObject = computed(() => ({
  left: `${adjustedPos.value.x}px`,
  top: `${adjustedPos.value.y}px`,
  transformOrigin: transformOrigin.value
}));

const handleScroll = () => { if (visible.value) hideContextMenu(); }
onMounted(() => window.addEventListener('scroll', handleScroll, true));
onUnmounted(() => window.removeEventListener('scroll', handleScroll, true));
</script>

<style scoped>
/* 遮罩 */
.radix-overlay {
  position: fixed;
  inset: 0;
  z-index: 1999;
  background: transparent;
}

/* 菜单容器 */
.radix-menu-content {
  position: fixed;
  z-index: 2000;
  background: #fff;
  border: 1px solid #e1e1e3;
  border-radius: 6px;
  padding: 4px;
  min-width: 160px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  user-select: none;
  display: flex;
  flex-direction: column;
}

/* 菜单项 */
.radix-item {
  padding: 6px 10px;
  font-size: 13px;
  color: #202020;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.1s;
}

/* 左侧内容 */
.radix-item-left {
  display: flex;
  align-items: center;
  flex-grow: 1;
  gap: 8px;
}

.radix-icon {
  font-size: 14px;
  color: #666;
}

/* 右侧快捷键 Slot */
.radix-right-slot {
  margin-left: auto;
  color: #888;
  font-size: 11px;
}

/* === 悬停/选中状态 === */
.radix-item:hover {
  background-color: #f0f0f0;
  color: #202020;
}

/* 危险选项 */
.radix-item.danger {
  color: #d72c0d;
}

.radix-item.danger .radix-icon {
  color: #d72c0d;
}

.radix-item.danger:hover {
  background-color: #fff1f0;
  color: #d72c0d;
}

/* 禁用状态 */
.radix-item.disabled {
  color: #999;
  pointer-events: none;
}

.radix-item.disabled .radix-icon {
  color: #bbb;
}

/* 分割线 */
.radix-separator {
  height: 1px;
  background: #f0f0f0;
  margin: 3px 0;
}

/* === PC端风格动画 === */
.radix-zoom-enter-active {
  animation: pcMenuFadeIn 0.15s ease-out forwards;
}

.radix-zoom-leave-active {
  animation: pcMenuFadeOut 0.1s ease-in forwards;
}

@keyframes pcMenuFadeIn {
  0% {
    opacity: 0;
    transform: scale(0.95);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes pcMenuFadeOut {
  0% {
    opacity: 1;
    transform: scale(1);
  }

  100% {
    opacity: 0;
    transform: scale(0.95);
  }
}
</style>
