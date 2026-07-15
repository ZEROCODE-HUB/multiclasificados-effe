import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

// iOS no tiene botón físico de "atrás" (a diferencia de Android). Habilitamos un
// swipe-back desde el borde izquierdo — como Safari/apps nativas: un arrastre
// horizontal que EMPIEZA pegado al borde izquierdo navega hacia atrás en el
// historial (React Router). Solo en iOS nativo; Android ya tiene su gesto/botón
// de sistema y en web no aplica. Es JS puro, así que sobrevive a que ios/ se
// regenere en cada build (no depende de config nativa).
export function IosSwipeBack() {
  const navigate = useNavigate();

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;

    const EDGE = 24;       // px desde el borde izquierdo donde puede iniciar
    const THRESHOLD = 70;  // px de desplazamiento horizontal para disparar
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      tracking = t.clientX <= EDGE; // solo si el dedo baja pegado al borde
      startX = t.clientX;
      startY = t.clientY;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      // Horizontal dominante hacia la derecha (no un scroll vertical).
      if (dx > THRESHOLD && dx > dy * 1.5) navigate(-1);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [navigate]);

  return null;
}
