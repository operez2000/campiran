<template>
<div class="error-gradient awesome-404 text-white text-center flex flex-center" style="min-height: 100vh; min-width: 100vw;">
    <div>
      <div style="font-size: 30vh">
        404
      </div>

      <div class="text-h2" style="opacity:.4">
        No se ha encontrado contenido aquí
      </div>

      <q-btn
        class="q-mt-xl"
        color="white"
        text-color="blue"
        unelevated
        to="/"
        label="Ir a inicio"
        size="xl"
        no-caps
      />
    </div>
  </div>
</template>

<script setup>
//
</script>

<style scoped>
.my-background {
  background: linear-gradient(135deg, #003da6, #c0c0c0);
  height: 100vh;
  margin: 0;
  font-family: sans-serif;
}

.error-gradient {
  background: linear-gradient(135deg, #2bbde1 0%, #006278 100%);
  background-color: #2193b0;
  transition: background 1s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 100vh;
  min-width: 100vw;
  overflow: auto;
}

.awesome-404 div[style*="font-size: 30vh"] {
  text-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 1.5px 0 #fff;
  animation: pop404 1.2s cubic-bezier(0.68, -0.55, 0.27, 1.55);
}

@keyframes pop404 {
  0% { transform: scale(0.7) rotate(-10deg); opacity: 0; }
  60% { transform: scale(1.1) rotate(3deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); }
}

.awesome-404 .text-h2 {
  letter-spacing: 2px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.15);
  transition: opacity 0.8s;
}

.awesome-404 .q-btn {
  box-shadow: 0 4px 24px 0 rgba(33,147,176,0.15);
  transition: box-shadow 0.3s, transform 0.3s;
}
.awesome-404 .q-btn:hover {
  box-shadow: 0 8px 32px 0 rgba(33,147,176,0.25);
  transform: translateY(-2px) scale(1.05);
}
</style>
