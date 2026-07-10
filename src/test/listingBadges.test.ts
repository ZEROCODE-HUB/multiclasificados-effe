import { describe, it, expect } from "vitest";
import { listingBadges, urgenteAllowedFor, URGENTE_MAX_DAYS } from "@/lib/listingBadges";

describe("listingBadges", () => {
  it("no devuelve insignias si el aviso no trae adicionales", () => {
    expect(listingBadges({})).toEqual([]);
    expect(listingBadges({ featured: false, urgent: false, confidential: false })).toEqual([]);
  });

  it("devuelve solo las activadas, en orden fijo (Destacado, Urgente, Confidencial)", () => {
    const b = listingBadges({ featured: true, urgent: true, confidential: true });
    expect(b.map((x) => x.label)).toEqual(["Destacado", "Urgente", "Confidencial"]);
  });

  it("mapea cada modalidad a su color oficial", () => {
    const [destacado] = listingBadges({ featured: true });
    const [urgente] = listingBadges({ urgent: true });
    const [confidencial] = listingBadges({ confidential: true });
    expect(destacado.cls).toContain("amber"); // dorado
    expect(urgente.cls).toContain("red"); // rojo/naranja
    expect(confidencial.cls).toContain("sky"); // celeste
  });
});

describe("urgenteAllowedFor", () => {
  it("permite Urgente en avisos cortos (24 h → 3 días, hasta 7 días)", () => {
    expect(urgenteAllowedFor(3)).toBe(true);
    expect(urgenteAllowedFor(7)).toBe(true);
    expect(URGENTE_MAX_DAYS).toBe(7);
  });

  it("no permite Urgente en planes largos (15, 30, 60, 90 días)", () => {
    expect(urgenteAllowedFor(15)).toBe(false);
    expect(urgenteAllowedFor(30)).toBe(false);
    expect(urgenteAllowedFor(60)).toBe(false);
    expect(urgenteAllowedFor(90)).toBe(false);
  });
});
