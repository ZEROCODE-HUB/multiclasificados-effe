import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Plataforma controlada (evita depender del entorno real de Capacitor).
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "ios" } }));

import { BootError } from "@/components/BootError";
import { APP_VERSION } from "@/lib/version";

beforeEach(() => {
  (window as unknown as { __EFFE_BOOTED__?: boolean }).__EFFE_BOOTED__ = false;
});

/**
 * El diagnóstico técnico ya no se enseña de entrada: quien se topa con esta
 * pantalla en producción es un anunciante, y una lista de VITE_SUPABASE_ANON_KEY
 * solo le dice que la app está rota y que nadie lo previó. La herramienta sigue
 * entera detrás de "Ver detalles" (y de `?diag=1`), que es lo que se usa cuando
 * hay que depurar de verdad — como con el IPA que contestaba "Invalid API key".
 */
const verDetalles = () => fireEvent.click(screen.getByRole("button", { name: /ver detalles/i }));

describe("BootError", () => {
  it("variant=config: lista las env requeridas y muestra versión, plataforma y botón", async () => {
    render(<BootError variant="config" />);

    expect(screen.getByText("No se pudo iniciar la app")).toBeTruthy();
    verDetalles();
    // Checklist de env requeridas (en tests import.meta.env.VITE_* es undefined
    // → ambas aparecen como faltantes).
    expect(screen.getByText("VITE_SUPABASE_URL")).toBeTruthy();
    expect(screen.getByText("VITE_SUPABASE_ANON_KEY")).toBeTruthy();
    // Versión actual y plataforma. Se compara contra la constante: fijar el
    // número a mano obligaba a tocar este test en cada despliegue.
    expect(screen.getByText(new RegExp(`v${APP_VERSION.replace(".", "\\.")}`))).toBeTruthy();
    expect(screen.getByText("ios")).toBeTruthy();
    // Botón de reintento.
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeTruthy();
  });

  it("marca window.__EFFE_BOOTED__ para silenciar el watchdog", () => {
    render(<BootError variant="config" />);
    expect((window as unknown as { __EFFE_BOOTED__?: boolean }).__EFFE_BOOTED__).toBe(true);
  });

  it("variant=config: muestra el motivo específico cuando se pasa detail", () => {
    render(<BootError variant="config" detail="VITE_SUPABASE_URL no es una URL http(s) válida." />);
    verDetalles();
    expect(screen.getByText(/no es una URL http\(s\) válida/)).toBeTruthy();
    // También reporta el valor recibido (aquí vacío, porque en tests no hay env).
    expect(screen.getByText(/Valor recibido para VITE_SUPABASE_URL/)).toBeTruthy();
  });

  it("variant=crash: muestra el mensaje del error", () => {
    render(<BootError variant="crash" error={new Error("boom-de-arranque")} />);
    verDetalles();
    expect(screen.getByText(/boom-de-arranque/)).toBeTruthy();
  });

  // Lo que veía el usuario al entrar al panel con la pestaña abierta desde antes
  // del despliegue: un diagnóstico de variables de entorno —todas correctas— y
  // el título "No se pudo iniciar la app". Ni el título ni la lista tenían nada
  // que ver con lo que pasaba, que era simplemente que su versión estaba vieja.
  describe("🔴 cuando lo único que pasa es que hay una versión nueva", () => {
    const desfasado = new TypeError(
      "Failed to fetch dynamically imported module: https://www.coleffe.com/assets/AdminDashboard-DS9jK6ef.js",
    );

    it("lo dice con esas palabras, en vez de 'no se pudo iniciar'", () => {
      render(<BootError variant="crash" error={desfasado} />);
      expect(screen.getByText(/Hay una versión nueva/i)).toBeTruthy();
      expect(screen.queryByText(/No se pudo iniciar la app/i)).toBeNull();
    });

    it("el botón invita a ACTUALIZAR, no a reintentar", () => {
      render(<BootError variant="crash" error={desfasado} />);
      expect(screen.getByRole("button", { name: /Actualizar/i })).toBeTruthy();
    });

    it("no enseña el diagnóstico de variables: aquí no aporta nada y asusta", () => {
      render(<BootError variant="crash" error={desfasado} />);
      expect(screen.queryByText(/VITE_SUPABASE_URL/)).toBeNull();
    });

    it("un fallo de verdad SÍ sigue enseñando el diagnóstico", () => {
      render(<BootError variant="crash" error={new Error("otra cosa")} />);
      verDetalles();
      expect(screen.getByText(/No se pudo iniciar la app/i)).toBeTruthy();
      expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeTruthy();
    });
  });
});

describe("lo que ve un anunciante, no un técnico", () => {
  // Quien se topa con esta pantalla en producción no va a revisar variables de
  // entorno: solo necesita saber que no va y poder reintentar. Enseñarle
  // `VITE_SUPABASE_ANON_KEY` le dice que la app está rota y que nadie lo previó.
  it("NO enseña nombres de variables de entrada", () => {
    render(<BootError variant="config" />);
    expect(screen.queryByText("VITE_SUPABASE_URL")).toBeNull();
    expect(screen.queryByText("VITE_SUPABASE_ANON_KEY")).toBeNull();
  });

  it("ni el detalle técnico del fallo", () => {
    render(<BootError variant="crash" error={new Error("boom-de-arranque")} />);
    expect(screen.queryByText(/boom-de-arranque/)).toBeNull();
  });

  it("dice qué pasa en cristiano y ofrece reintentar", () => {
    render(<BootError variant="config" />);
    expect(screen.getByText(/vuelve a intentarlo/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeTruthy();
  });

  it("y no le manda a revisar el build, que no es cosa suya", () => {
    render(<BootError variant="config" />);
    expect(screen.queryByText(/variables del build/i)).toBeNull();
  });

  it("la versión SÍ se ve siempre: es lo primero que se pregunta en un reporte", () => {
    // Leerla de una captura ahorra media conversación.
    render(<BootError variant="config" />);
    expect(screen.getByText(new RegExp(`v${APP_VERSION.replace(".", String.fromCharCode(92) + ".")}`))).toBeTruthy();
  });
});

describe("la herramienta sigue entera para quien la necesita", () => {
  it("«Ver detalles» destapa el diagnóstico completo", () => {
    render(<BootError variant="config" />);
    fireEvent.click(screen.getByRole("button", { name: /ver detalles/i }));
    expect(screen.getByText("VITE_SUPABASE_URL")).toBeTruthy();
  });

  it("y `?diag=1` lo abre solo, sin explicarle a nadie dónde pulsar", () => {
    // Sirve para mandar un enlace y pedir una captura.
    window.history.replaceState({}, "", "/?diag=1");
    try {
      render(<BootError variant="config" />);
      expect(screen.getByText("VITE_SUPABASE_URL")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /ver detalles/i })).toBeNull();
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });
});
