<script setup lang="ts">
import type { SkillMetadata } from '@renderer/services/skillsService'

interface Props {
  skills: SkillMetadata[]
  activeIndex?: number
  mobile?: boolean
  emptyText?: string
  childOpen?: boolean
}

withDefaults(defineProps<Props>(), {
  activeIndex: 0,
  mobile: false,
  emptyText: '未找到匹配技能',
  childOpen: false
})

const emit = defineEmits<{
  select: [skill: SkillMetadata]
  openChild: []
}>()
</script>

<template>
  <div class="skill-mention-panel" :class="{ 'mobile-skill-mention-panel': mobile }">
    <button
      class="skill-section-item"
      :class="{ 'is-active': childOpen }"
      type="button"
      @mousedown.prevent="emit('openChild')"
    >
      <span class="skill-section-icon">
        <span class="skill-section-icon-glyph"></span>
      </span>
      <div class="skill-section-copy">
        <span class="skill-section-title">技能</span>
      </div>
      <span class="skill-section-arrow">›</span>
    </button>

    <div
      v-if="childOpen"
      class="skill-mention-child-panel"
      :class="{ 'mobile-skill-mention-child-panel': mobile }"
    >
      <div class="skill-mention-list-header">
        <span class="skill-mention-list-title">技能</span>
      </div>

      <div class="skill-mention-list">
        <button
          v-for="(skill, index) in skills"
          :key="skill.path"
          class="skill-mention-item"
          :class="{ 'is-active': index === activeIndex }"
          type="button"
          @mousedown.prevent="emit('select', skill)"
        >
          <span class="skill-mention-name">@{{ skill.name }}</span>
          <span class="skill-mention-desc">{{ skill.description }}</span>
        </button>

        <div v-if="skills.length === 0" class="skill-mention-empty">{{ emptyText }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skill-mention-panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 30;
  width: 138px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-card);
  box-shadow:
    0 8px 18px rgba(var(--text-rgb), 0.1),
    0 1px 3px rgba(var(--text-rgb), 0.05);
  overflow: visible;
}

.skill-section-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  text-align: left;
  color: var(--text-primary);
  transition: background-color 0.14s ease;
}

.skill-section-item:hover,
.skill-section-item.is-active {
  background: var(--bg-hover);
}

.skill-section-icon {
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.skill-section-icon-glyph {
  position: relative;
  display: inline-block;
  width: 10px;
  height: 8px;
  border: 1px solid currentColor;
  border-radius: 2px;
}

.skill-section-icon-glyph::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -1px;
  bottom: -1px;
  width: 1px;
  background: currentColor;
  transform: translateX(-50%);
}

.skill-section-copy {
  min-width: 0;
  display: flex;
  flex: 1;
}

.skill-section-title {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.01em;
}

.skill-section-arrow {
  font-size: 13px;
  line-height: 1;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.skill-mention-child-panel {
  position: absolute;
  left: calc(100% + 10px);
  top: -1px;
  width: min(248px, 20vw);
  max-height: 160px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-card);
  box-shadow:
    0 8px 18px rgba(var(--text-rgb), 0.1),
    0 1px 3px rgba(var(--text-rgb), 0.05);
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.skill-mention-child-panel::before {
  content: '';
  position: absolute;
  left: -5px;
  top: 11px;
  width: 10px;
  height: 10px;
  border-left: 1px solid rgba(var(--text-rgb), 0.08);
  border-bottom: 1px solid rgba(var(--text-rgb), 0.08);
  background: inherit;
  transform: rotate(45deg);
}

.skill-mention-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px 5px;
  border-bottom: 1px solid var(--border-subtle);
}

.skill-mention-list-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.skill-mention-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.skill-mention-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  text-align: left;
  color: var(--text-primary);
  transition: background-color 0.14s ease;
}

.skill-mention-item:hover,
.skill-mention-item.is-active {
  background: var(--bg-hover);
}

.skill-mention-name {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  flex-shrink: 0;
}

.skill-mention-desc {
  font-size: 9px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.skill-mention-empty {
  padding: 10px 6px;
  font-size: 10px;
  color: var(--text-tertiary);
  text-align: center;
  margin: auto 0;
}

.mobile-skill-mention-panel {
  bottom: calc(100% + 6px);
  width: min(138px, calc(100vw - 32px));
}

.mobile-skill-mention-child-panel {
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  width: auto;
}

.mobile-skill-mention-child-panel::before {
  display: none;
}

@media (max-width: 767px) {
  .skill-mention-panel {
    width: min(138px, calc(100vw - 32px));
  }

  .skill-mention-child-panel {
    left: 0;
    right: 0;
    top: calc(100% + 8px);
    width: auto;
    max-height: 160px;
  }
}
</style>
