// composables/useLocalStorage.js
import { ref, watch } from 'vue'

export function useLocalStorage(key, defaultValue = null) {
  const storedValue = ref(defaultValue)

  const load = () => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(key)
      storedValue.value = saved ? JSON.parse(saved) : defaultValue
    } catch (err) {
      console.warn(`Error parsing localStorage key "${key}":`, err)
      storedValue.value = defaultValue
    }
  }

  // Load initial value
  load()

  // Watch local changes and persist
  watch(
    storedValue,
    (val) => {
      if (typeof window === 'undefined') return
      try {
        if (val === null) {
          localStorage.removeItem(key)
        } else {
          localStorage.setItem(key, JSON.stringify(val))
        }
      } catch (err) {
        console.warn(`Error writing localStorage key "${key}":`, err)
      }
    },
    { deep: true }
  )

  // 🔄 Watch for changes in *other* tabs or manual updates
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === key) {
        load()
      }
    })
  }

  return storedValue
}
