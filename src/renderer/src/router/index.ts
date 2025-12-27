import { createRouter, createWebHashHistory } from 'vue-router'
import { isMobile } from '../composables/useDeviceType'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: () => {
        return isMobile.value ? '/mobile/chat' : '/chat'
      }
    },
    {
      path: '/chat',
      component: () => import('../pages/chat/index.vue')
    },
    {
      path: '/temp-chat',
      component: () => import('../pages/TempChatPage.vue')
    },
    {
      path: '/mobile/chat',
      component: () => import('../pages/mobile/ChatList.vue')
    },
    {
      path: '/mobile/chat/session',
      component: () => import('../pages/mobile/ChatDetail.vue')
    },
    {
      path: '/mobile/settings',
      component: () => import('../pages/mobile/SettingsList.vue')
    },
    {
      path: '/mobile/settings/:tab',
      component: () => import('../pages/mobile/SettingsDetail.vue')
    },
    {
      path: '/mobile/settings/models/:id',
      component: () => import('../pages/mobile/ModelProviderDetail.vue')
    },
    {
      path: '/mobile/settings/knowledge/:id',
      component: () => import('../pages/mobile/KnowledgeDetail.vue')
    }
  ]
})

export default router
