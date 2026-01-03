<template>
    <img v-bind="$attrs" :src="computedSrc" />
</template>

<script setup lang="ts">
import { assetsHandler } from '@renderer/utils'

const props = defineProps<{
    src?: string
}>()

const computedSrc = computed(() => {
    return assetsHandler(props.src || '')
})
</script>
