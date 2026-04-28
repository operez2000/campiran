// src/composables/useAuth.js
import { supabase } from 'boot/supabase'

export async function signInWithGoogle () {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
  }, {
    redirectTo: window.location.origin
  })

  if (error) {
    console.error('Google login error:', error.message)
  }
}

export async function logout () {
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('Logout error:', error.message)
  }
}

// supabase.auth.onAuthStateChange((event, session) => {
//   console.log('Auth change:', event, session)
// })
