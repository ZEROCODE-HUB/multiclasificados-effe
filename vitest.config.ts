import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Tope de procesos en paralelo. Las ~26 pruebas de migración levantan cada
    // una un Postgres de verdad (PGlite, WebAssembly): sin tope, la máquina
    // arranca tantas a la vez que unas cuantas se quedan sin memoria y la suite
    // falla de forma aleatoria —siempre archivos distintos— aunque el código
    // esté bien. Eso es peor que lento: hace dudar de resultados correctos.
    maxWorkers: 4,
    // Las pruebas de migración levantan un Postgres real (WebAssembly): en
    // solitario tardan ~1 s, pero con la suite completa en marcha se van a 3-4 s
    // y con el límite por defecto (5 s) fallaban de forma aleatoria estando el
    // código bien. El margen no ralentiza nada: solo actúa si se supera.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
