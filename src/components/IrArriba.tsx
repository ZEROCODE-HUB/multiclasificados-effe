// Al cambiar de pantalla, la página empieza por arriba.
//
// El navegador conserva el desplazamiento entre rutas de una SPA, y eso se
// notaba de verdad: el enlace "Publicar aviso" del pie de la portada —que está
// al final de una página larguísima— dejaba al usuario a media altura del
// formulario, encima del bloque "05 Duración y adicionales", como si la app se
// hubiera saltado los cuatro primeros pasos. Lo reportó el cliente y pasa con
// cualquier enlace que salga desde abajo, no solo con ese.
//
// Se mira SOLO `pathname` a propósito: los filtros del buscador y la paginación
// viajan en la query (`?cat=`, `?page=`), y saltar arriba en cada tecleo sería
// peor que el problema. Tampoco se toca la navegación con "atrás": ahí el
// navegador restaura la posición y eso es justo lo que el usuario espera.
import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export function IrArriba() {
  const { pathname } = useLocation();
  const tipo = useNavigationType();
  const anterior = useRef<string | null>(null);

  useEffect(() => {
    // POP = botón "atrás"/"adelante": el navegador ya restaura la posición.
    if (tipo === "POP") { anterior.current = pathname; return; }
    if (anterior.current === pathname) return; // solo cambió la query
    anterior.current = pathname;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, tipo]);

  return null;
}

export default IrArriba;
