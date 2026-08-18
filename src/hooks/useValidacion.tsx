import { useCallback, useState } from "react";
import { enfocarCampo, fallos, primerFallo, type Regla } from "@/lib/validacion";

// Estado de errores de un formulario + el cableado visual de cada campo.
// Se usa así:
//
//   const v = useValidacion();
//   if (!v.validar([{ campo: "titulo", ok: !!titulo, mensaje: "Ponle un título" }])) return;
//   <div {...v.props("titulo")}> … </div>
//   <MensajeDeError campo="titulo" errores={v.errores} />

// Excepción razonada a `only-export-components`, igual que en
// TablePagination: el hook y el mensajito que pinta se usan siempre juntos.
// eslint-disable-next-line react-refresh/only-export-components
export function useValidacion() {
  const [errores, setErrores] = useState<Record<string, string>>({});

  const validar = useCallback((reglas: Regla[]): boolean => {
    const malos = fallos(reglas);
    setErrores(malos);
    const primero = primerFallo(reglas);
    if (!primero) return true;
    // Un frame de margen: en publicar hay un useLayoutEffect que corrige el
    // scroll al mostrar adicionales, y si enfocamos antes nos lo pisa.
    requestAnimationFrame(() => enfocarCampo(primero.campo));
    return false;
  }, []);

  const limpiar = useCallback((campo?: string) => {
    setErrores((prev) => {
      if (!campo) return {};
      if (!(campo in prev)) return prev;
      const { [campo]: _, ...resto } = prev;
      return resto;
    });
  }, []);

  const props = useCallback(
    (campo: string) => ({
      "data-campo": campo,
      "aria-invalid": errores[campo] ? true : undefined,
      className: errores[campo] ? "rounded-sm ring-2 ring-destructive/60 ring-offset-2 ring-offset-background" : undefined,
    }),
    [errores],
  );

  return { errores, validar, limpiar, props };
}

export function MensajeDeError({ campo, errores }: { campo: string; errores: Record<string, string> }) {
  const msg = errores[campo];
  if (!msg) return null;
  return <p className="mt-1 text-xs text-destructive">{msg}</p>;
}
