import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Artefactos de compilación: no son código nuestro. `android/app/build` lo
  // genera Gradle y trae su propio `native-bridge.js` de Capacitor, que salía en
  // el informe con errores que no se pueden arreglar (ni tiene sentido).
  { ignores: ["dist", "android/app/build", "ios/App/build", "coverage"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // `src/components/ui` son los componentes de shadcn, copiados tal cual de la
    // librería. Casi todos exportan además sus variantes (`buttonVariants`…),
    // que es justo lo que la regla desaconseja — pero la regla habla de que la
    // recarga en caliente funcione fino, no de que el código esté mal, y
    // reescribir código vendorizado por eso no compensa.
    //
    // Lo mismo vale para `e2e/harness`, que son andamios de prueba: ahí no hay
    // recarga en caliente que preservar.
    //
    // Se apaga AQUÍ y solo aquí para que la lista de avisos quede vacía: una
    // lista con 39 avisos que nadie mira no avisa de nada, y el día que salga
    // uno de verdad pasaría desapercibido.
    files: ["src/components/ui/**", "e2e/harness/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
