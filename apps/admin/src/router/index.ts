import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { getToken } from '../utils/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('../layouts/AdminLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('../views/DashboardView.vue'),
        meta: { title: '数据概览' },
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('../views/OrdersView.vue'),
        meta: { title: '订单管理' },
      },
      {
        path: 'orders/:tradeNo',
        name: 'order-detail',
        component: () => import('../views/OrderDetailView.vue'),
        meta: { title: '订单详情' },
      },
      {
        path: 'channels/alipay',
        name: 'alipay',
        component: () => import('../views/AlipayView.vue'),
        meta: { title: '支付宝配置' },
      },
      {
        path: 'channels/wxpay',
        name: 'wxpay',
        component: () => import('../views/WxpayView.vue'),
        meta: { title: '微信支付配置' },
      },
      {
        path: 'merchants',
        name: 'merchants',
        component: () => import('../views/MerchantsView.vue'),
        meta: { title: '商户管理' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('../views/SettingsView.vue'),
        meta: { title: '系统设置' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const token = getToken()
  if (!to.meta.public && !token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.path === '/login' && token) {
    return { path: '/dashboard' }
  }
  return true
})

export default router
