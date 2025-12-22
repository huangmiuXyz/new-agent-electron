<template>
  <ChatMessageItemDynamicTool :tool_part="tool_part" />
</template>
<script lang="ts" setup>
import { ToolUIPart } from 'ai';

defineProps<{
  tool_part: ToolUIPart
}>()
</script>
