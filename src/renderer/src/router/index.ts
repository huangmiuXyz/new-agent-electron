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
      meta: { sort: 1 },
      children: [
        {
          path: '/mobile/chat/list',
          component: () => import('../pages/mobile/ChatList.vue'),
          meta: {
            showTabBar: true,
            depth: 1
          }
        },
        {
          path: '/mobile/chat/session',
          component: () => import('../pages/mobile/ChatDetail.vue'),
          meta: { depth: 2 }
        }
      ]
    },
    {
      path: '/mobile/settings',
      meta: { sort: 2 },
      children: [
        {
          path: '/mobile/settings/list',
          component: () => import('../pages/mobile/SettingsList.vue'),
          meta: {
            showTabBar: true,
            depth: 1
          }
        },
        {
          path: '/mobile/settings/:tab',
          component: () => import('../pages/mobile/SettingsDetail.vue'),
          meta: { depth: 2 }
        },
        {
          path: '/mobile/settings/models/:id',
          component: () => import('../pages/mobile/ModelProviderDetail.vue'),
          meta: { depth: 2 }
        },
        {
          path: '/mobile/settings/knowledge/:id',
          component: () => import('../pages/mobile/KnowledgeDetail.vue'),
          meta: { depth: 2 }
        }
      ]
    }
  ]
})

export default router
