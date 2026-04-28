import { ref, watch } from 'vue'

const user = ref(null)

// initialize from localStorage if present (SSR-safe)
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const raw = localStorage.getItem('data')
    if (raw) user.value = JSON.parse(raw)
  } catch (error) {
    console.error('Error loading user from localStorage:', error)
  }
}

export function useUser() {
  return {
    user,
    setUser: (u) => {
      user.value = u ?? null
    },
    clearUser: () => { user.value = null }
  }
}

// persist to localStorage automatically (SSR-safe)
watch(user, (v) => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    if (v) localStorage.setItem('data', JSON.stringify(v))
    else localStorage.removeItem('data')
  } catch (error) {
    console.error('Error persisting user to localStorage:', error)
  }
}, { deep: true })
