<script setup lang="ts">
import { DynamicToolUIPart, ToolUIPart } from 'ai'

defineProps<{
  tool_part: DynamicToolUIPart | ToolUIPart
}>()
const isCollapsed = ref(true)

const isInputCollapsed = ref(true)
const isOutputCollapsed = ref(true)

const toggleInputCollapse = () => {
  isInputCollapsed.value = !isInputCollapsed.value
}

const toggleOutputCollapse = () => {
  isOutputCollapsed.value = !isOutputCollapsed.value
}

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="msg-row tool-row">
    <div class="tool-card">
      <div class="tool-header" @click="toggleCollapse">
        <div class="tool-info">
          <div class="tool-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path
                d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <span class="tool-name">{{
            (tool_part as DynamicToolUIPart)?.toolName || tool_part?.title
          }}</span>
        </div>
        <div class="tool-status">
          <slot name="status">
            <span class="status-dot"></span>
            <span class="status-text">Completed</span>
          </slot>
        </div>
      </div>
      <div class="tool-content" :class="{ collapsed: isCollapsed }">
        <slot name="content">
          <div class="io-container">
            <div class="io-section io-input">
              <div class="io-header" @click="toggleInputCollapse">
                <div class="io-left">
                  <div class="io-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <span class="io-label">输入</span>
                </div>
                <svg class="collapse-icon" :class="{ collapsed: isInputCollapsed }" xmlns="http://www.w3.org/2000/svg"
                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <div class="io-content" :class="{ collapsed: isInputCollapsed }">{{ tool_part.input }}</div>
            </div>
            <div class="io-section io-output" v-if="tool_part.output">
              <div class="io-header" @click="toggleOutputCollapse">
                <div class="io-left">
                  <div class="io-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                  <span class="io-label">输出</span>
                </div>
                <svg class="collapse-icon" :class="{ collapsed: isOutputCollapsed }" xmlns="http://www.w3.org/2000/svg"
                  width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <div class="io-content" :class="{ collapsed: isOutputCollapsed }">{{ tool_part.output }}</div>
            </div>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.msg-row {
  display: flex;
  padding: 4px 0px;
  /* Reduced padding for compactness */
  justify-content: flex-start;
  /* Align left like system messages */
}

.tool-card {
  width: 100%;
  background-color: var(--bg-card);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  box-shadow: 0 1px 2px rgba(var(--text-rgb), 0.03);
  transition: box-shadow 0.2s;
}

.tool-card:hover {
  box-shadow: 0 4px 6px rgba(var(--text-rgb), 0.04);
}

.tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--bg-hover);
  border-bottom: 1px solid var(--border-color-light);
  cursor: pointer;
  user-select: none;
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-icon {
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}

.tool-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.tool-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--color-success);
  /* Success green */
}

.status-text {
  font-size: 10px;
  color: var(--text-secondary);
  font-weight: 500;
  text-transform: uppercase;
}

.tool-content {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-sub);
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background-color: var(--bg-card);
  max-height: 400px;
  overflow-y: auto;
}

.tool-content.collapsed {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-bottom: none;
  opacity: 0;
}

/* Input/Output container */
.io-container {
  display: flex;
  flex-direction: column;
}

.io-section {
  overflow: hidden;
}

.io-left {
  display: flex;
  gap: 8px;
}

.io-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 10px;
  background-color: var(--border-color-light);
  border-bottom: 1px solid var(--border-color-light);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  user-select: none;
}

.collapse-icon {
  color: var(--text-secondary);
  transition: transform 0.2s ease;
}

.collapse-icon.collapsed {
  transform: rotate(-90deg);
}

.io-icon {
  color: var(--text-secondary);
  display: flex;
  align-items: center;
}

.io-label {
  color: var(--text-sub);
}

.io-input .io-header {
  background-color: var(--bg-active);
  border-bottom-color: rgba(var(--accent-rgb), 0.3);
}

.io-input .io-icon {
  color: var(--accent-color);
}

.io-input .io-label {
  color: var(--accent-color);
}

.io-output .io-header {
  background-color: rgba(var(--color-success-rgb, 34, 197, 94), 0.1);
  border-bottom-color: rgba(var(--color-success-rgb, 34, 197, 94), 0.3);
}

.io-output .io-icon {
  color: var(--color-success);
}

.io-output .io-label {
  color: var(--color-success);
}

.io-content {
  padding: 10px 12px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background-color: var(--bg-card);
  max-height: 300px;
  overflow-y: auto;
  border-top: 1px solid transparent;
  transition: all 0.2s ease;
}

.io-content.collapsed {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  overflow: hidden;
  opacity: 0;
}

.io-input .io-content {
  border-top-color: rgba(var(--accent-rgb), 0.3);
}

.io-output .io-content {
  border-top-color: rgba(var(--color-success-rgb, 34, 197, 94), 0.3);
}

/* Scrollbar styling for the content */
.io-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.io-content::-webkit-scrollbar-track {
  background: transparent;
}

.io-content::-webkit-scrollbar-thumb {
  background: var(--border-color-light);
  border-radius: 3px;
}

.io-content::-webkit-scrollbar-thumb:hover {
  background: var(--border-color);
}
</style>
