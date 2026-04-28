<template>
  <q-page class="q-pa-md background-layout">
    <div class="q-gutter-md flex flex-center" style="height: calc(100vh - 10px);">
      <q-card class="glass-element">
        <q-card-section>
          <div class="text-h6">Dashboard principal</div>
          <div class="text-subtitle2">Bienvenido al resumen general</div>
        </q-card-section>

        <q-separator spaced inset />

        <q-card-section>
          <div class="row q-col-gutter-md flex justify-evenly">
            <div class="col-12 col-md-4 flex flex-center">
              <q-card class="glass-card q-pa-md card-layout">
                <q-card-section>
                  <div class="text-h6">Usuarios</div>
                  <div class="text-h4">1,234</div>
                </q-card-section>
              </q-card>
            </div>
            <div class="col-12 col-md-4 flex flex-center">
              <q-card class="glass-card q-pa-md card-layout">
                <q-card-section>
                  <div class="text-h6">Ventas</div>
                  <div class="text-h4">$12,345</div>
                </q-card-section>
              </q-card>
            </div>
            <div class="col-12 col-md-4 flex flex-center">
              <q-card class="glass-card q-pa-md card-layout">
                <q-card-section>
                  <div class="text-h6">Pedidos</div>
                  <div class="text-h4">56</div>
                </q-card-section>
              </q-card>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<style scoped>
.bg-gradient {
  min-height: 100vh;
  background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
}
.glass-card {
  background: rgba(255, 255, 255, 0.25);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.18);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.18);
}
.card-layout {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
</style>

<script setup>
</script>
