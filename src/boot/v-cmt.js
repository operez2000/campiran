// boot/v-cmt.js
// Client-only registration to avoid SSR hydration node mismatches
export default ({ app }) => {
  if (typeof window === 'undefined') {
    // running on server — do not register the directive
    return
  }

  app.directive('cmt', {
    // client-only lightweight behavior; do not change structure/text produced on server
    beforeMount(el, binding) {
      // store a non-structural data attribute for debugging/behavior
      try {
        el.dataset.vcmt = binding && binding.value ? String(binding.value) : 'true'
      } catch {
        void 0
      }
    },
    mounted() {
      // additional client-side logic (avoid any DOM structure changes)
    },
    unmounted(el) {
      try { delete el.dataset.vcmt } catch {
        void 0
      }
    }
  })
}
