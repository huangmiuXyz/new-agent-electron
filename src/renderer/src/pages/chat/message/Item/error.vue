<template>{{ error.message }}</template>
<script lang="ts" setup>

defineProps<{
    error: Error
}>()
</script>