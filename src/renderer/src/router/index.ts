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
      children: [
        {
          path: '/mobile/chat/list',
          component: () => import('../pages/mobile/ChatList.vue'),
          meta: {
            showTabBar: true
          }
        },
        {
          path: '/mobile/chat/session',
          component: () => import('../pages/mobile/ChatDetail.vue')
        }
      ]
    },
    {
      path: '/mobile/settings',
      children: [
        {
          path: '/mobile/settings/list',
          component: () => import('../pages/mobile/SettingsList.vue'),
          meta: {
            showTabBar: true
          }
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
    }
  ]
})

export default router
