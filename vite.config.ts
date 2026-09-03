import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import fs from "fs";

/**
 * Identificador único de cada build.
 *
 * Se mete DENTRO del bundle (`__BUILD_ID__`) y ADEMÁS se escribe en
 * `version.json`, para que la aplicación que ya está corriendo pueda preguntar
 * si lo que hay desplegado sigue siendo ella misma. Ver `AvisoActualizar`.
 *
 * Es la marca de tiempo del build y no `APP_VERSION` a propósito: si alguien
 * olvida subir la versión, esto cambia igual. Un aviso de actualización que
 * depende de que nadie se despiste no sirve para nada.
 */
const BUILD_ID = String(Date.now());

/** Escribe `version.json` junto al resto del build. */
const publicarVersion = (): PluginOption => ({
  name: "effe-version-json",
  apply: "build",
  closeBundle() {
    // La versión legible sale de la MISMA fuente que usa la app, leída como
    // texto: importar un .ts desde la configuración de Vite obligaría a
    // compilarlo aparte.
    const src = fs.readFileSync(path.resolve(__dirname, "src/lib/version.ts"), "utf8");
    const version = /APP_VERSION\s*=\s*"([^"]+)"/.exec(src)?.[1] ?? "";
    fs.writeFileSync(
      path.resolve(__dirname, "dist/version.json"),
      `${JSON.stringify({ version, buildId: BUILD_ID })}\n`,
    );
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), publicarVersion(), mode === "development" && componentTagger()].filter(Boolean),
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    rollupOptions: {
      output: {
        // Separa las librerías pesadas en chunks de vendor para aligerar el
        // bundle inicial (las rutas ya usan lazy(); esto reparte lo de node_modules).
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Utilidades diminutas que usa TODA la app (cn()). Sin regla propia
          // Rollup las fusionaba con el chunk vecino más pequeño y acabaron
          // dentro de vendor-charts: la portada precargaba los 410 KB de
          // recharts solo para resolver clsx (IT3-005). Van a vendor-ui, que ya
          // es dependencia del entry, así que no añade ninguna petición.
          if (/node_modules[\\/](clsx|tailwind-merge|class-variance-authority)[\\/]/.test(id)) return "vendor-ui";
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("victory")) return "vendor-charts";
          if (id.includes("leaflet")) return "vendor-maps";
          if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("vaul")) return "vendor-ui";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("react-router") || id.includes("@remix-run")) return "vendor-router";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query"],
  },
}));
