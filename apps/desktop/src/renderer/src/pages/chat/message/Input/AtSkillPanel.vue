<script setup lang="ts">
import type { SkillMetadata } from '@renderer/services/skillsService'

interface Props {
  skills: SkillMetadata[]
  activeIndex?: number
  mobile?: boolean
  emptyText?: string
}

withDefaults(defineProps<Props>(), {
  activeIndex: 0,
  mobile: false,
  emptyText: '未找到匹配技能'
})

const emit = defineEmits<{
  select: [skill: SkillMetadata]
}>()
</script>

<template>
  <div class="skill-mention-panel" :class="{ 'mobile-skill-mention-panel': mobile }">
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
</template>

<style scoped>
.skill-mention-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  padding: 6px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-card) 96%, white);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
  overflow-y: auto;
}

.skill-mention-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  text-align: left;
  color: var(--text-primary);
}

.skill-mention-item:hover,
.skill-mention-item.is-active {
  background: color-mix(in srgb, var(--color-primary) 10%, var(--bg-hover));
}

.skill-mention-name {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
}

.skill-mention-desc {
  min-width: 0;
  flex: 1;
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-mention-empty {
  padding: 12px 10px;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
}

.mobile-skill-mention-panel {
  bottom: calc(100% + 6px);
}
</style>
