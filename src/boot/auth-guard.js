import { supabase } from './supabase'

export default async ({ router }) => {
  router.beforeEach(async (to, from, next) => {
    const publicPages = ['/login', '/auth/callback']
    // const isPublic = publicPages.includes(to.path)
    const authRequired = !publicPages.includes(to.path)

    const {
      data: { session },
      // error,
    } = await supabase.auth.getSession()

    if (authRequired && !session) {
      next('/login')
    } else if (session && to.path === '/login') {
      next('/') // or wherever your home is
    } else {
      next()
    }
  })
}
