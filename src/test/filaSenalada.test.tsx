import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { useFilaSenalada } from "@/hooks/useFilaSenalada";

/**
 * `useFilaSenalada`: llegar a una lista señalando la fila concreta.
 *
 * Es lo que convierte "algo pasó, búscalo" en "es este". Se resolvió a mano en
 * «Mis avisos» cuando el cliente pidió que la campana marcara el aviso, y de ahí
 * salió este hook para que las demás listas a las que llevan las notificaciones
 * —búsquedas guardadas, postulaciones recibidas, postulaciones propias— no
 * tengan cada una su versión ligeramente distinta.
 */

function Lista({ listo = true }: { listo?: boolean }) {
  const { senalado, resaltado, filaRef, clasesDeResaltado } = useFilaSenalada("fila", listo);
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate("/?fila=b")}>IR_A_B</button>
      <p data-testid="senalado">{senalado}</p>
      <p data-testid="resaltado">{resaltado}</p>
      {["a", "b"].map((id) => (
        <div
          key={id}
          data-testid={`fila-${id}`}
          ref={id === senalado ? filaRef : undefined}
          className={clasesDeResaltado(id)}
        >
          {id}
        </div>
      ))}
    </div>
  );
}

const pintar = (url: string, listo = true) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Lista listo={listo} />
    </MemoryRouter>,
  );

let scrollIntoView: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => vi.useRealTimers());

describe("señalar la fila que dice la URL", () => {
  it("la resalta y sube hasta ella", () => {
    pintar("/?fila=a");
    expect(screen.getByTestId("resaltado").textContent).toBe("a");
    expect(screen.getByTestId("fila-a").className).toContain("ring-2");
    expect(screen.getByTestId("fila-b").className).toBe("");

    // El salto va tras un respiro: si se hiciera en el mismo ciclo, la fila
    // —o la pestaña que la contiene— todavía no está en el DOM.
    expect(scrollIntoView).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("el resaltado se apaga solo", () => {
    // Es para ENCONTRAR la fila, no para dejarla marcada: uno permanente se lee
    // como un estado del elemento ("esta postulación es especial").
    pintar("/?fila=a");
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByTestId("resaltado").textContent).toBe("");
    expect(screen.getByTestId("fila-a").className).toBe("");
  });

  it("sin parámetro no señala nada", () => {
    pintar("/");
    expect(screen.getByTestId("resaltado").textContent).toBe("");
    act(() => { vi.advanceTimersByTime(3000); });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("si el usuario YA está en la pantalla", () => {
  it("una notificación nueva vuelve a señalar, con la otra fila", () => {
    // ES EL FALLO QUE TENÍA LA PANTALLA DE MENSAJES, evitado aquí de raíz: el
    // parámetro se lee con `useSearchParams` y no una sola vez al montar, así
    // que cambiar la URL sin remontar el componente sí hace algo.
    pintar("/?fila=a");
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByTestId("resaltado").textContent).toBe("");

    act(() => { screen.getByText("IR_A_B").click(); });

    expect(screen.getByTestId("resaltado").textContent).toBe("b");
    expect(screen.getByTestId("fila-b").className).toContain("ring-2");
  });
});

describe("mientras la lista carga", () => {
  it("no intenta saltar a una fila que aún no existe", () => {
    pintar("/?fila=a", false);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByTestId("resaltado").textContent).toBe("");
  });

  it("y lo hace en cuanto termina", () => {
    const { rerender } = pintar("/?fila=a", false);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter initialEntries={["/?fila=a"]}>
        <Lista listo />
      </MemoryRouter>,
    );
    act(() => { vi.advanceTimersByTime(200); });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
