import { describe, it, expect } from "vitest";
import { evaluateUpdate, type AppVersionInfo } from "@/lib/appVersion";

const info = (over: Partial<AppVersionInfo>): AppVersionInfo => ({
  latest_build: 0, min_build: 0, version_name: "", download_url: "", notes: "",
  ota_version: "", ota_url: "", ...over,
});

describe("evaluateUpdate", () => {
  it("está al día si el build iguala o supera al último", () => {
    expect(evaluateUpdate(10, info({ latest_build: 10, min_build: 1 }))).toBe("up-to-date");
    expect(evaluateUpdate(12, info({ latest_build: 10, min_build: 1 }))).toBe("up-to-date");
  });

  it("sugiere actualizar si hay una versión más nueva", () => {
    expect(evaluateUpdate(9, info({ latest_build: 10, min_build: 1 }))).toBe("optional");
  });

  it("obliga a actualizar si está por debajo del mínimo soportado", () => {
    expect(evaluateUpdate(5, info({ latest_build: 10, min_build: 8 }))).toBe("forced");
  });

  it("el mínimo manda sobre lo opcional", () => {
    // build 7 < min 8 → forzado, aunque también sea < latest.
    expect(evaluateUpdate(7, info({ latest_build: 10, min_build: 8 }))).toBe("forced");
  });

  it("sin datos publicados (todo en 0) no molesta al usuario", () => {
    expect(evaluateUpdate(10, info({ latest_build: 0, min_build: 0 }))).toBe("up-to-date");
  });
});
