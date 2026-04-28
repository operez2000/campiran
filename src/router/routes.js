const routes = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('pages/IndexPage.vue')
      },
      {
        path: '/dashboard',
        component: () => import('src/pages/DashboardPage.vue'),
      },
      {
        path: '/inventario-etiquetas',
        component: () => import('src/pages/LabelPrinting.vue'),
      },
      {
        path: '/areas',
        component: () => import('components/AreasCrud.vue'),
      },
      {
        path: '/departamentos',
        component: () => import('components/DepartmentsCrud.vue'),
      },
      {
        path: '/categorias',
        component: () => import('components/CategoriesCrud.vue'),
      },
      {
        path: 'items',
        component: () => import('pages/ItemsCrud.vue')
      },
      {
        path: 'usuarios',
        component: () => import('pages/UsersCrud.vue')
      },
    ]
  },
  {
    path: '/login',
    component: () => import('layouts/LoginLayout.vue'),
    children: [
      {
        path: '',
        component: () => import('pages/LoginPage.vue')
      }
    ]
  },
  {
    path: '/auth/callback',
    component: () => import('pages/AuthCallback.vue'),
  },
  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue')
  }
]

export default routes
