import * as esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Construye una página autocontenida con el componente REAL montado: bundle de
 * esbuild + el CSS de Tailwind del proyecto compilado al vuelo. No hace falta
 * servidor ni login: los módulos que hablan con Supabase se sustituyen por stubs.
 */

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..", "..");
const SRC = path.join(ROOT, "src");
const STUBS = path.join(DIR, "stubs.ts");

const STUBBED = new Set(["@/lib/admin", "@/hooks/usePermissions", "@/lib/supabase", "@/hooks/use-toast"]);

/** Qué componente montar y qué módulos cortarle. Por defecto, AdminUsers. */
export interface HarnessOpts {
  entry?: string;
  stubs?: string;
  stubbed?: string[];
  /**
   * Variables de entorno visibles para el componente (`import.meta.env`).
   *
   * Normalmente no hace falta ninguna. Los mapas sí las necesitan: sin llave el
   * componente ni intenta cargar el SDK, así que la prueba no vería un mapa
   * sino el cartel de "no está configurado". Ver e2e/harness/googleEnv.ts.
   */
  env?: Record<string, string>;
}

const cached = new Map<string, Promise<string>>();

const build = async ({ entry = "main.tsx", stubs = STUBS, stubbed, env }: HarnessOpts): Promise<string> => {
  const corta = stubbed ? new Set(stubbed) : STUBBED;
  const bundle = await esbuild.build({
    entryPoints: [path.join(DIR, entry)],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    absWorkingDir: ROOT,
    write: false,
    // Con un componente que importa CSS hay más de una salida, y esbuild exige
    // outdir para nombrarlas. No se escribe nada en disco (write: false).
    outdir: path.join(ROOT, ".harness-out"),
    // Las imágenes que referencie un componente van embebidas, así la página
    // sigue siendo autocontenida.
    loader: { ".png": "dataurl", ".svg": "dataurl" },
    define: {
      "process.env.NODE_ENV": '"production"',
      // Vite sustituye `import.meta.env` al compilar; esbuild a secas no, y sin
      // esto el módulo que lee la llave se encuentra un `undefined`.
      "import.meta.env": JSON.stringify(env ?? {}),
    },
    plugins: [
      {
        name: "alias-src",
        setup(b) {
          b.onResolve({ filter: /^@\// }, async (args) => {
            if (corta.has(args.path)) return { path: stubs };
            const r = await b.resolve("./" + args.path.slice(2), {
              resolveDir: SRC,
              kind: "import-statement",
            });
            return r.errors.length ? { errors: r.errors } : { path: r.path, external: r.external };
          });
        },
      },
    ],
  });

  const cssFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "effe-css-")), "app.css");
  execFileSync(process.execPath, [
    path.join(ROOT, "node_modules", "tailwindcss", "lib", "cli.js"),
    "-i", path.join(SRC, "index.css"), "-o", cssFile, "--minify",
  ], { cwd: ROOT, stdio: "pipe" });

  // Un componente puede importar su propio CSS: esbuild lo emite como archivo
  // aparte, así que hay que buscar el JS por extensión en vez de dar por hecho
  // que es el primero.
  const js = bundle.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
  const bundledCss = bundle.outputFiles
    .filter((f) => f.path.endsWith(".css"))
    .map((f) => f.text)
    .join("\n");

  // El CSS del componente va PRIMERO: el de la app debe poder pisarlo.
  return `<style>${bundledCss}</style>`
    + `<style>${fs.readFileSync(cssFile, "utf8")}</style>`
    + `<div id="root"></div>`
    + `<script>${js}</script>`;
};

/** Cacheado por proceso y por entrada: cada worker compila cada harness una vez. */
export const harnessHtml = (opts: HarnessOpts = {}) => {
  // El entorno entra en la clave: el mismo componente compilado con llave y sin
  // ella son dos páginas distintas, y sin esto la segunda reutilizaría la primera.
  const key = `${opts.entry ?? "main.tsx"}|${JSON.stringify(opts.env ?? {})}`;
  if (!cached.has(key)) cached.set(key, build(opts));
  return cached.get(key)!;
};
