import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
