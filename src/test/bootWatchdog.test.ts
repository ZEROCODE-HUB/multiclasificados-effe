// @vitest-environment node
// El watchdog de arranque es un script externo de 'self' (CSP-safe) que muestra
// un aviso si el bundle no ejecuta. Verificamos que exista y esté enganchado en
// el HTML, y que respete la marca de arranque.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const html = readFileSync(path.join(process.cwd(), "index.html"), "utf8");
const watchdogPath = path.join(process.cwd(), "public", "boot-watchdog.js");

describe("boot-watchdog", () => {
  it("index.html referencia el script externo", () => {
    expect(html).toMatch(/<script[^>]+src="\/boot-watchdog\.js"/);
  });

  it("el archivo existe en public/", () => {
    expect(existsSync(watchdogPath)).toBe(true);
  });

  it("no hace nada si el bundle ya arrancó (guarda __EFFE_BOOTED__)", () => {
    const src = readFileSync(watchdogPath, "utf8");
    expect(src).toMatch(/__EFFE_BOOTED__/);
    expect(src).toMatch(/boot-loader/);
  });
});
