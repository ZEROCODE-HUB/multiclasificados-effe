import { useCallback, useEffect, useState, type FocusEvent } from "react";
import { Capacitor } from "@capacitor/core";

// En el APK (Capacitor), al abrir el teclado del móvil este tapa los campos de
// más abajo del formulario. Este hook devuelve:
//   - `kbPad`: el alto del teclado, para reservarlo como padding inferior en un
//     contenedor con scroll y así poder desplazar el último campo por encima.
//   - `scrollFocusedIntoView`: manejador `onFocus`/`onFocusCapture` que centra el
//     campo enfocado en la parte visible una vez abierto el teclado.
// En web (sin plataforma nativa) no hace nada: `kbPad` queda en 0 y el handler
// solo desplaza suavemente el campo (inofensivo).
export function useKeyboardInset() {
  const [kbPad, setKbPad] = useState(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    const handles: Array<{ remove: () => void }> = [];
    (async () => {
      // Import dinámico: el plugin nativo solo se carga en el APK/IPA.
      const { Keyboard } = await import("@capacitor/keyboard");
      const onShow = (info: { keyboardHeight: number }) => {
        if (active) setKbPad(info.keyboardHeight || 0);
      };
      const onHide = () => { if (active) setKbPad(0); };
      const events: Array<[string, (i: { keyboardHeight: number }) => void]> = [
        ["keyboardWillShow", onShow],
        ["keyboardDidShow", onShow],
        ["keyboardWillHide", onHide],
        ["keyboardDidHide", onHide],
      ];
      for (const [ev, cb] of events) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const h = await Keyboard.addListener(ev as any, cb as any);
        if (active) handles.push(h); else h.remove();
      }
    })();
    return () => { active = false; handles.forEach((h) => h.remove()); };
  }, []);

  const scrollFocusedIntoView = useCallback((e: FocusEvent<HTMLElement>) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      // Espera a que el teclado termine de abrir y se aplique el padding.
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    }
  }, []);

  return { kbPad, scrollFocusedIntoView };
}
