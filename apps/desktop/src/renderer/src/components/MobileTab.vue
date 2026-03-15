<template>
  <div class="mobile-layout">
    <div class="content-viewport">
      <RouterView v-slot="{ Component }">
        <transition :name="pageTransition">
          <component :is="Component" class="page-view" :key="route.path" />
        </transition>
      </RouterView>
    </div>
    <MobileTabBar v-if="showTabBar" />
  </div>
</template>

<script setup>
import { computed, inject, ref } from 'vue'
import MobileTabBar from './MobileTabBar.vue'

const route = useRoute()
const pageTransition = inject('pageTransition', ref('fade'))

const showTabBar = computed(() => route.meta?.showTabBar === true)
</script>

<style scoped>
.mobile-layout {
  width: 100%;
  height: var(--vh, 100dvh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-viewport {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.page-container {
  padding: 0;
  height: 100%;
}

.page-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-view > * {
  width: 100%;
  height: 100%;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
