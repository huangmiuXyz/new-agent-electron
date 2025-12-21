import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/temp-chat',
      component: () => import('../pages/TempChatPage.vue')
    }
  ]
})

export default router
