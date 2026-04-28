// src/boot/auth.js
import { supabase } from './supabase'
import { useUser } from 'src/stores/userStore'
// import { useRouter } from 'vue-router'

const updateUser = async (session) => {
  if (!session || !session.user) return

  const id_user = session.user.id
  const email = session.user.email
  const user_name = session.user.user_metadata?.full_name

  // fetch or insert user in 'users' table (existing code)
  let { data, error } = await supabase
    .from('users')
    .select('id_user, email, user_name, role')
    .eq('id_user', id_user)

  if (error) {
    console.error('Error fetching users:', error.message)
  } else {
    if (!data || (data && data.length === 0)) {
      const { data: inserted, error: insertErr } = await supabase
        .from('users')
        .insert({
          id_user,
          email,
          user_name
        })
        .select()
      if (insertErr) {
        console.error('error after trying to insert user in auth.js', insertErr)
      } else {
        // use the inserted record
        data = inserted
      }
    }
  }

  // update reactive user store if available
  try {
    const { setUser } = useUser()
    if (data && data[0]) setUser(data[0])
  } catch (e) {
    console.warn('Could not update user store', e)
    // ignore if store not ready
  }

  // merge with any existing local data and persist (including tienda if present in metadata)
  let existingData = {}
  try {
    const raw = localStorage.getItem('data')
    if (raw) existingData = JSON.parse(raw)
  } catch (e) {
    console.warn('Error parsing existing localStorage data', e)
  }

  // Preserve existing client-side fields, and set user
  if (data && data[0]) existingData.user = data[0]

  // If the auth session includes a preferred tienda object in user_metadata, persist it
  const tiendaFromMetadata = session.user.user_metadata?.tienda
  if (tiendaFromMetadata) {
    existingData.tienda = tiendaFromMetadata
  }

  try {
    localStorage.setItem('data', JSON.stringify(existingData))
  } catch (e) {
    console.warn('Could not persist data to localStorage', e)
  }


  // if (data?.user) {
  //   const { id, email, user_metadata } = data.user

  //   const { error: upsertError } = await supabase
  //     .from('users')
  //     .upsert([
  //       {
  //         id,
  //         user_id,
  //         user_name,
  //         email,
  //         last_access
  //       }
  //     ], { onConflict: ['id'] })

  //   if (upsertError) {
  //     console.error('Error upserting user:', upsertError.message)
  //     $q.notify({
  //       type: "negative",
  //       color: 'deep-orange-10',
  //       message: "Error guardando usuario",
  //       caption: upsertError.message,
  //       position: "top-right"
  //     })
  //   } else {
  //     router.push('/dashboard')
  //   }
  // }
}

export default async ({ router }) => {
  supabase.auth.onAuthStateChange((event, session) => {
    // console.log('Auth change:', event, session)
    // console.log('Auth change user info:', session)

    // Optional: protect routes
    if (event === 'SIGNED_OUT') {
      router.push('/login')
    }

    if (event === 'SIGNED_IN') {
      updateUser(session)
      // Maybe redirect to dashboard
      router.push('/')
    }
  })
}
