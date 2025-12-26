<script setup lang="ts">
import { useRoute } from 'vue-router'
import { watch } from 'vue'
const route = useRoute()



watch(() => route.params.id, (newId) => {
    if (newId) {
        localStorage.setItem('activeProviderId', newId as string)
    }
}, { immediate: true })

</script>

<template>
    <div class="mobile-provider-detail">
        <SettingsProvider />
    </div>
</template>

<style scoped>
.mobile-provider-detail {
    width: 100%;
    height: 100%;
    background: #fff;
}

/* Force hide list container if it leaks through due to logic delay? 
   No, SettingsProvider has v-if="!isMobile || showProviderForm". 
   If showProviderForm is true, List is hidden.
*/
</style>
