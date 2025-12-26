<template>
  <!-- 主菜单 -->
  <Teleport to="body">
    <transition name="radix-zoom">
      <div v-if="visible" ref="menuRef" class="radix-menu-content" :class="[`variant-${props.variant}`]"
        :style="styleObject" @contextmenu.prevent>
        <template v-for="(item, index) in menuOptions" :key="index">

          <!-- 分割线 -->
          <div v-if="item.type === 'divider'" class="radix-separator"></div>

          <!-- 菜单项 -->
          <div v-else-if="typeof item.ifShow !== 'function' || item.ifShow(contextData)" class="radix-item"
            :ref="el => setMenuItemRef(el, item)"
            :class="{ 'danger': item.danger, 'disabled': item.disabled, 'has-submenu': item.children && item.children.length > 0 }"
            @click="handleItemClick(item)" @mouseenter="handleItemHover($event, item)" @mouseleave="handleItemLeave">
            <!-- 左侧内容：图标 + 文字 -->
            <div class="radix-item-left">
              <component :is="item.icon" />
              <span>{{ item.label }}</span>
            </div>

            <!-- 右侧槽位：快捷键或子菜单箭头 -->
            <div class="radix-right-slot">
              <!-- 子菜单箭头 -->
              <span v-if="item.children && item.children.length > 0" class="submenu-arrow">›</span>
              <!-- 快捷键 -->
              <span v-else-if="item.shortcut">{{ item.shortcut }}</span>
            </div>
          </div>

        </template>
      </div>
    </transition>
  </Teleport>

  <!-- 子菜单 -->
  <Teleport to="body">
    <transition name="radix-zoom">
      <div v-if="submenuVisible" ref="submenuRef" class="radix-menu-content radix-submenu"
        :class="[`variant-${props.variant}`]" :style="submenuStyleObject" @contextmenu.prevent>
        <template v-for="(item, index) in submenuOptions" :key="index">
          <!-- 分割线 -->
          <div v-if="item.type === 'divider'" class="radix-separator"></div>

          <!-- 菜单项 -->
          <div v-else class="radix-item" :class="{ 'danger': item.danger, 'disabled': item.disabled }"
            @click="handleSubmenuItemClick(item)">
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

// 定义 variant 类型
type MenuVariant = 'default' | 'glass';

// Props
interface Props {
  variant?: MenuVariant;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default'
});

const {
  visible,
  position,
  menuOptions,
  contextData,
  submenuVisible,
  submenuPosition,
  submenuOptions,
  hideContextMenu,
  showSubmenu,
  hideSubmenu
} = useContextMenu<T>();
const menuRef = ref<HTMLElement | null>(null);
const submenuRef = ref<HTMLElement | null>(null);
const adjustedPos = ref({ x: 0, y: 0 });
const submenuAdjustedPos = ref({ x: 0, y: 0 });
const transformOrigin = ref('top left');
const submenuTransformOrigin = ref('top left');
let hoverTimer: number | null = null;
const menuItemRefs = new Map<MenuItem<any>, HTMLElement>();

// 如果配置项里有 handler 函数，直接执行
// 否则分发 select 事件给父组件
const emit = defineEmits(['select']);

const handleItemClick = (item: MenuItem<T>) => {
  if (item.disabled) return;

  // 如果有子菜单，不执行点击事件，由 hover 处理
  if (item.children && item.children.length > 0) return;

  // 1. 如果配置项自带 onClick 处理函数，优先执行
  if (typeof item.onClick === 'function') {
    item.onClick((contextData.value as T));
  } else {
    // 2. 否则通过 action 字符串通知父组件
    emit('select', { action: item.action, data: contextData.value });
  }

  hideContextMenu();
};

const handleSubmenuItemClick = (item: MenuItem<T>) => {
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

const setMenuItemRef = (el: Element | ComponentPublicInstance | null, item: MenuItem<T>) => {
  if (el && el instanceof HTMLElement) {
    menuItemRefs.set(item, el);
  } else {
    menuItemRefs.delete(item);
  }
};

const handleItemHover = (_event: MouseEvent, item: MenuItem<T>) => {
  if (item.children && item.children.length > 0) {
    // 使用延迟来避免鼠标快速移动时频繁切换
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      // 从 ref Map 中获取菜单项元素
      const target = menuItemRefs.get(item);

      // 检查元素是否存在
      if (target) {
        showSubmenu(target, item);
      }
    }, 100);
  }
};

const handleItemLeave = () => {
  // 不清除定时器，让子菜单正常显示
  // 如果需要隐藏子菜单，应该在鼠标离开整个菜单区域时处理
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

// 子菜单位置计算逻辑
const calculateSubmenuPosition = async () => {
  await nextTick();
  if (!submenuRef.value || !menuRef.value) return;

  const { offsetWidth: w, offsetHeight: h } = submenuRef.value;
  const { innerWidth: winW, innerHeight: winH } = window;
  const { x, y } = submenuPosition;

  // 默认在父菜单右侧
  let newX = x;
  let newY = y;
  let originX = 'left';
  let originY = 'top';

  // 如果右侧空间不足，显示在左侧
  if (x + w > winW) {
    // 获取父菜单的左边界
    const parentRect = menuRef.value.getBoundingClientRect();
    newX = parentRect.left - w;
    originX = 'right';
  }

  // 如果下方空间不足，向上调整
  if (y + h > winH) {
    newY = winH - h;
    originY = 'bottom';
  }

  submenuAdjustedPos.value = { x: newX, y: newY };
  submenuTransformOrigin.value = `${originY} ${originX}`;
};

// 初始化子菜单位置
watch(submenuPosition, () => {
  // 当子菜单位置更新时，先设置一个默认值
  submenuAdjustedPos.value = { x: submenuPosition.x, y: submenuPosition.y };
});

watch(visible, (val) => { if (val) calculatePosition(); });
watch(submenuVisible, (val) => { if (val) calculateSubmenuPosition(); });

const styleObject = computed(() => ({
  left: `${adjustedPos.value.x}px`,
  top: `${adjustedPos.value.y}px`,
  transformOrigin: transformOrigin.value
}));

const submenuStyleObject = computed(() => ({
  left: `${submenuAdjustedPos.value.x}px`,
  top: `${submenuAdjustedPos.value.y}px`,
  transformOrigin: submenuTransformOrigin.value
}));

const handleScroll = () => {
  if (visible.value) hideContextMenu();
  if (submenuVisible.value) hideSubmenu();
}
onMounted(() => window.addEventListener('scroll', handleScroll, true));
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll, true);
  if (hoverTimer) clearTimeout(hoverTimer);
});
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

/* === Glass 变体样式（磨砂玻璃效果） === */
.radix-menu-content.variant-glass {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  padding: 5px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15), 0 2px 10px rgba(0, 0, 0, 0.05);
}

/* Glass 变体的菜单项 */
.radix-menu-content.variant-glass .radix-item {
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  gap: 10px;
}

/* Glass 变体的图标 */
.radix-menu-content.variant-glass .radix-icon {
  font-size: 15px;
  color: #86868b;
}

/* Glass 变体的悬停效果 */
.radix-menu-content.variant-glass .radix-item:hover {
  background-color: #000000;
  color: #ffffff;
}

.radix-menu-content.variant-glass .radix-item:hover .radix-icon {
  color: #ffffff;
}

.radix-menu-content.variant-glass .radix-item:hover .radix-right-slot {
  color: rgba(255, 255, 255, 0.5);
}

/* Glass 变体的危险选项 */
.radix-menu-content.variant-glass .radix-item.danger {
  color: #ff3b30;
}

.radix-menu-content.variant-glass .radix-item.danger .radix-icon {
  color: #ff3b30;
}

.radix-menu-content.variant-glass .radix-item.danger:hover {
  background-color: #ff3b30;
  color: #ffffff;
}

.radix-menu-content.variant-glass .radix-item.danger:hover .radix-icon {
  color: #ffffff;
}

/* Glass 变体的分割线 */
.radix-menu-content.variant-glass .radix-separator {
  background-color: rgba(0, 0, 0, 0.06);
  margin: 4px 8px;
}

/* Glass 变体的子菜单箭头 */
.radix-menu-content.variant-glass .submenu-arrow {
  color: #86868b;
}

.radix-menu-content.variant-glass .radix-item:hover .submenu-arrow {
  color: #ffffff;
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

/* 子菜单样式 */
.radix-submenu {
  z-index: 2001;
}

/* 有子菜单的项 */
.radix-item.has-submenu {
  position: relative;
}

/* 子菜单箭头 */
.submenu-arrow {
  color: #888;
  font-size: 14px;
  margin-left: auto;
}
</style>
