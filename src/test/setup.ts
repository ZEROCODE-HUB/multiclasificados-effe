import "@testing-library/jest-dom";

// Los tests que corren en entorno node (p.ej. los de migraciones SQL, que usan
// `// @vitest-environment node`) no tienen `window`.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
