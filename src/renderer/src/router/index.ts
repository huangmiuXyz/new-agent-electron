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
      path: '/notes',
      component: () => import('../pages/notes/index.vue')
    },
    {
      path: '/mobile/chat',
      redirect: '/mobile/chat/list',
      meta: { sort: 1 },
      children: [
        {
          path: '/mobile/chat/list',
          component: () => import('../pages/mobile/ChatList.vue'),
          meta: {
            showTabBar: true,
            depth: 1,
            title: '对话'
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
      path: '/mobile/notes',
      redirect: '/mobile/notes/list',
      meta: { sort: 2 },
      children: [
        {
          path: '/mobile/notes/list',
          component: () => import('../pages/mobile/NoteList.vue'),
          meta: {
            showTabBar: true,
            depth: 1,
            title: '笔记'
          }
        },
        {
          path: '/mobile/notes/editor',
          component: () => import('../pages/notes/editor.vue'),
          meta: { depth: 2 }
        }
      ]
    },
    {
      path: '/mobile/settings',
      redirect: '/mobile/settings/list',
      meta: { sort: 3 },
      children: [
        {
          path: '/mobile/settings/list',
          component: () => import('../pages/mobile/SettingsList.vue'),
          meta: {
            showTabBar: true,
            depth: 1,
            title: '设置'
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
          meta: { depth: 3 }
        },
        {
          path: '/mobile/settings/knowledge/:id',
          component: () => import('../pages/mobile/KnowledgeDetail.vue'),
          meta: { depth: 3 }
        }
      ]
    }
  ]
})

export default router
