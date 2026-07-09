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

let cached: Promise<string> | null = null;

const build = async (): Promise<string> => {
  const bundle = await esbuild.build({
    entryPoints: [path.join(DIR, "main.tsx")],
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
            if (STUBBED.has(args.path)) return { path: STUBS };
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

/** Cacheado por proceso: cada worker de Playwright compila una sola vez. */
export const harnessHtml = () => (cached ??= build());
