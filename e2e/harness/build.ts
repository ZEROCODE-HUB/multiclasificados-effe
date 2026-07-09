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
}

const cached = new Map<string, Promise<string>>();

const build = async ({ entry = "main.tsx", stubs = STUBS, stubbed }: HarnessOpts): Promise<string> => {
  const corta = stubbed ? new Set(stubbed) : STUBBED;
  const bundle = await esbuild.build({
    entryPoints: [path.join(DIR, entry)],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    absWorkingDir: ROOT,
    write: false,
    define: { "process.env.NODE_ENV": '"production"' },
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

  return `<style>${fs.readFileSync(cssFile, "utf8")}</style>`
    + `<div id="root"></div>`
    + `<script>${bundle.outputFiles[0].text}</script>`;
};

/** Cacheado por proceso y por entrada: cada worker compila cada harness una vez. */
export const harnessHtml = (opts: HarnessOpts = {}) => {
  const key = opts.entry ?? "main.tsx";
  if (!cached.has(key)) cached.set(key, build(opts));
  return cached.get(key)!;
};
