// @vitest-environment node
// El zoom del navegador no se puede bloquear: quien necesita ampliar para leer
// se queda fuera (WCAG 2.1 · 1.4.4 Resize Text, nivel AA). Lighthouse lo marca
// como "[user-scalable=no] is used in the <meta name=viewport>".
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const html = readFileSync(path.join(process.cwd(), "index.html"), "utf8");
const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/)?.[1] ?? "";

describe("meta viewport", () => {
  it("existe", () => {
    expect(viewport).not.toBe("");
  });

  it("no bloquea el zoom", () => {
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no/i);
    expect(viewport).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/i);
    expect(viewport).not.toMatch(/minimum-scale/i);
  });

  it("si algún día se pone maximum-scale, debe ser 5 o más", () => {
    const max = viewport.match(/maximum-scale\s*=\s*([\d.]+)/i)?.[1];
    if (max) expect(Number(max)).toBeGreaterThanOrEqual(5);
  });

  it("mantiene viewport-fit=cover (notch y barra de gestos del APK)", () => {
    expect(viewport).toMatch(/viewport-fit\s*=\s*cover/i);
  });
});
