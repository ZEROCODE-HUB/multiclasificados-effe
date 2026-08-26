import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararDom } from "./domPolyfills";
import fs from "node:fs";
import path from "node:path";
import LegalPage from "@/pages/LegalPage";
import { CORREO_SOPORTE } from "@/lib/soporte";

/**
 * Los Términos y la Política de Privacidad, con dirección propia.
 *
 * El documento ya existía y estaba completo, pero vivía SOLO dentro de un modal.
 * Google Play exige un ENLACE público a la política de privacidad —lo pide al
 * crear la ficha y lo vuelve a revisar en CADA actualización—, y un texto que
 * solo se ve abriendo un diálogo no se puede enlazar: no hay dirección que
 * pegar.
 *
 * Lo que se fija aquí no es el aspecto de la página, es que el enlace siga
 * llevando al texto. Si esto se rompe, no se rompe una pantalla: se para una
 * actualización en Play, y eso se descubre tarde y con prisa.
 */
beforeEach(prepararDom);

const abrir = (ruta = "/terminos") =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <LegalPage />
    </MemoryRouter>,
  );

describe("la página existe y lleva el documento entero", () => {
  it("se ve el título y quién responde, con su RUC", async () => {
    abrir();
    // `getAllByText`: el RUC sale en la cabecera y otra vez dentro del
    // documento, en los datos de la empresa. Que salga dos veces está bien.
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      /Términos y Condiciones y Política de Privacidad/i,
    );
    expect(screen.getAllByText(/RUC N° 20616009061/).length).toBeGreaterThan(0);
  });

  it("y las secciones que a Play le importan: qué datos se recogen y los derechos", async () => {
    abrir();
    expect(await screen.findByText(/Datos personales recopilados/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Derechos ARCO/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Plazo de conservación/i).length).toBeGreaterThan(0);
  });

  it("`/privacidad` enseña el mismo documento que `/terminos`", async () => {
    // Son un documento único, así lo redactó el abogado. Dos direcciones para
    // que cada una lleve a quien la usa donde espera llegar.
    abrir("/privacidad");
    expect(await screen.findByText(/Datos personales recopilados/i)).toBeInTheDocument();
  });

  it("no exige sesión: se renderiza tal cual", async () => {
    // Un revisor de Play no tiene cuenta. Si esto pidiera login, la ficha se
    // quedaría parada sin que nadie entienda por qué.
    abrir();
    expect(await screen.findByText(/Datos personales recopilados/i)).toBeInTheDocument();
  });
});

describe("el correo de contacto", () => {
  const LEGAL = fs.readFileSync(
    path.resolve(__dirname, "../components/LegalTerms.tsx"), "utf8",
  );

  it("es el buzón que de verdad recibe, no uno escrito a mano", async () => {
    // Decía `privacidad@coleffe.com`, que nadie confirmó que existiera; su
    // gemelo `soporte@coleffe.com` resultó NO existir en cPanel. Una política
    // que remite a un correo que rebota PARA EJERCER DERECHOS sobre datos
    // personales es lo que mira un revisor y lo que reclama un usuario.
    // Lo que no puede quedar es el correo CABLEADO: ni como `mailto:` ni como
    // texto a la vista. En los comentarios sí puede aparecer, y de hecho
    // aparece, explicando por qué se quitó.
    expect(LEGAL).not.toContain("mailto:privacidad@coleffe.com");
    expect(LEGAL).not.toMatch(/^\s+privacidad@coleffe\.com$/m);
    expect(LEGAL).toContain("CORREO_SOPORTE");
    abrir();
    expect((await screen.findAllByText(CORREO_SOPORTE)).length).toBeGreaterThan(0);
  });

  it("sale del módulo compartido, así que no puede quedarse atrás", () => {
    // Si mañana cambia el buzón, cambia en un sitio y cambia aquí también.
    expect(LEGAL).toContain('from "@/lib/soporte"');
  });
});

describe("las rutas están declaradas y nada las tapa", () => {
  const raiz = (p: string) => path.resolve(__dirname, "../..", p);
  const APP = fs.readFileSync(raiz("src/App.tsx"), "utf8");
  const GATE = fs.readFileSync(raiz("src/components/MaintenanceGate.tsx"), "utf8");

  it("`/terminos` y `/privacidad` existen en el router", () => {
    expect(APP).toMatch(/path="\/terminos"/);
    expect(APP).toMatch(/path="\/privacidad"/);
  });

  it("y el modo mantenimiento NO las cierra", () => {
    // Play revisa el enlace en cada actualización: una tarde de mantenimiento
    // no puede convertirse en una ficha rechazada.
    expect(GATE).toMatch(/RUTAS_PERMITIDAS[^\]]*"\/terminos"/s);
    expect(GATE).toMatch(/RUTAS_PERMITIDAS[^\]]*"\/privacidad"/s);
  });

  it("el modal sigue existiendo y ahora enlaza a la pantalla", () => {
    // El modal es el que se lee al registrarse, sin salir del formulario. La
    // pantalla es la que se enlaza. Las dos usan el MISMO contenido, así que no
    // pueden acabar diciendo cosas distintas.
    const LEGAL = fs.readFileSync(raiz("src/components/LegalTerms.tsx"), "utf8");
    expect(LEGAL).toContain("export function TermsDialog");
    expect(LEGAL).toMatch(/to="\/terminos"/);
  });
});
