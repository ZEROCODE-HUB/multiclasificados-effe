import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * B-07 — validar el DNI o RUC al presentar una reclamación.
 *
 * Lo delicado aquí no es validar: es DÓNDE se para.
 *
 * El Libro de Reclamaciones es un derecho del consumidor y registrarlo es
 * obligación nuestra. Si se bloqueara el envío porque un servicio de terceros
 * no responde —o porque se topó su límite de consultas—, estaríamos impidiendo
 * reclamar por un fallo propio. Eso no se sostiene ante Indecopi ni ante el
 * sentido común.
 *
 * Así que se bloquea solo cuando el documento NO EXISTE. Si no se pudo
 * comprobar, el reclamo entra igual y quien lo atienda lo verá.
 */
const FORM = fs.readFileSync(
  path.resolve(__dirname, "../components/LibroReclamaciones.tsx"), "utf8",
);

describe("qué se valida", () => {
  it("el documento se comprueba contra el registro", () => {
    expect(FORM).toContain("verifyDocument");
  });

  it("solo DNI y RUC: son los únicos consultables", () => {
    // Exigir lo mismo al carné de extranjería o al pasaporte dejaría fuera a
    // quien no puede demostrarlo por esta vía.
    expect(FORM).toMatch(/docType === "DNI" \|\| form\.docType === "RUC"/);
  });
});

describe("dónde NO se para", () => {
  it("un límite de consultas no impide reclamar", () => {
    expect(FORM).toContain("!doc.rateLimited");
  });

  it("solo frena si el documento no existe, no ante cualquier error", () => {
    // `!doc.ok` a secas incluiría "el servicio no responde", y ahí hay que
    // dejar pasar.
    expect(FORM).toMatch(/no existe\|no se encontr/);
    expect(FORM).not.toMatch(/if \(!doc\.ok\) \{\s*toast\.error/);
  });

  it("y queda escrito por qué, que es lo que evita que alguien lo 'arregle'", () => {
    // Sin el motivo, endurecerlo parece una mejora.
    expect(FORM).toMatch(/derecho del consumidor/i);
  });
});
