import { useEffect, useRef, useState, useCallback } from "react";
import { Bold, Ban } from "lucide-react";
import { COLORES, type TextoConFormato } from "@/lib/textoConFormato";
import { leerDelDom, escribirEnDom, seleccionDentro } from "@/lib/editorDom";

/**
 * El campo de descripción, con negrita y color.
 *
 * SE VE MIENTRAS SE ESCRIBE. Lo pidió el cliente y es lo correcto: una vista
 * previa aparte obliga a mirar a dos sitios para entender una sola cosa.
 *
 * CÓMO ESTÁ HECHO, y por qué así. Escribir lo maneja el navegador; este
 * componente no toca el contenido mientras se teclea, solo lo LEE. Para el
 * teclado del móvil esto es un campo de texto normal, con su autocorrección, su
 * cursor y su deshacer nativos — que es justo lo que se pierde cuando un editor
 * casero se pone a reescribir el DOM en cada tecla, y lo que hace que se
 * comporten mal en iOS.
 *
 * El formato se aplica con los comandos del propio navegador. Están marcados
 * como obsoletos en la especificación, pero ninguno los ha retirado y traen el
 * deshacer incluido. Si algún día desaparecieran, se sustituyen SOLO aquí: ni el
 * modelo que se guarda ni lo que ve el visitante dependen de ellos.
 */

interface Props {
  valor: TextoConFormato;
  onChange: (v: TextoConFormato) => void;
  placeholder?: string;
  maxLength?: number;
  id?: string;
  className?: string;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
}

export function EditorDeTexto({
  valor, onChange, placeholder, maxLength = 2000, id, className, onFocus,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [vacio, setVacio] = useState(true);
  const [marcas, setMarcas] = useState<{ b: boolean; c: string | null }>({ b: false, c: null });
  // Lo que este componente escribió por última vez. Sirve para distinguir un
  // cambio que viene de fuera (cargar un aviso para editarlo) de uno propio.
  const ultimo = useRef<string>("");

  /** Lee el contenido y avisa al formulario. */
  const publicar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const leido = leerDelDom(el);
    ultimo.current = JSON.stringify(leido);
    setVacio(leido.length === 0);
    onChange(leido);
  }, [onChange]);

  // Vuelca el valor de fuera SOLO cuando de verdad es otro. Sin esta
  // comparación, cada pulsación provocaría un volcado, el cursor saltaría al
  // principio y escribir sería imposible.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const entrante = JSON.stringify(valor ?? []);
    if (entrante === ultimo.current) return;
    ultimo.current = entrante;
    escribirEnDom(el, valor ?? []);
    setVacio((valor ?? []).length === 0);
  }, [valor]);

  /** Refresca los botones para que se vean pulsados según dónde esté el cursor. */
  const mirarMarcas = useCallback(() => {
    const el = ref.current;
    if (!el || !seleccionDentro(el)) return;
    try {
      const b = document.queryCommandState("bold");
      const bruto = document.queryCommandValue("foreColor") || "";
      const encontrado = COLORES.find(
        (c) => c.valor && (bruto.toLowerCase() === c.hex.toLowerCase() || bruto.replace(/\s/g, "") === hexRgbSinEspacios(c.hex)),
      );
      setMarcas({ b, c: encontrado?.valor ?? null });
    } catch {
      // Un navegador que no responda a la consulta no puede dejar el editor
      // inservible: los botones simplemente no se ven pulsados.
    }
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", mirarMarcas);
    return () => document.removeEventListener("selectionchange", mirarMarcas);
  }, [mirarMarcas]);

  /** Ejecuta un comando del navegador conservando la selección. */
  const mandar = (orden: () => void) => {
    const el = ref.current;
    if (!el) return;
    if (!seleccionDentro(el)) el.focus();
    orden();
    publicar();
    mirarMarcas();
  };

  const alternarNegrita = () => mandar(() => document.execCommand("bold"));

  const ponerColor = (hex: string) => mandar(() => {
    // `styleWithCSS` pide un `style="color:"` en vez de un `<font>`. Safari
    // puede ignorarlo, y por eso `editorDom` entiende las dos formas.
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* da igual */ }
    document.execCommand("foreColor", false, hex);
  });

  /**
   * Pegar entra siempre como TEXTO PLANO.
   *
   * Sin esto, pegar de Word o de otra web mete su HTML entero en el editor:
   * tipografías, tamaños, tablas y colores que no son de la paleta. Se perdería
   * el formato del origen —que es lo correcto— pero sobre todo se evita que el
   * campo se llene de cosas que luego hay que descartar al guardar.
   */
  const alPegar = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const texto = e.clipboardData.getData("text/plain");
    if (!texto) return;
    const el = ref.current;
    const espacio = maxLength - (el ? leerDelDom(el).reduce((n, p) => n + p.t.length, 0) : 0);
    if (espacio <= 0) return;
    document.execCommand("insertText", false, texto.slice(0, espacio));
    publicar();
  };

  /**
   * Frena ANTES de pasarse del límite, no después.
   *
   * Se mira lo que va a entrar (`ev.data`) sumado a lo que ya hay: comprobarlo
   * después de la inserción dejaría escribir el carácter 2001 y luego quitarlo,
   * que se ve como si el campo «se comiera» letras.
   *
   * El pegado NO pasa por aquí —lo recorta `alPegar`— y borrar tampoco: solo se
   * frena lo que suma.
   */
  const alEscribir = (e: React.FormEvent<HTMLDivElement>) => {
    const ev = e.nativeEvent as InputEvent;
    const el = ref.current;
    if (!el || !ev.inputType?.startsWith("insert")) return;
    if (ev.inputType === "insertFromPaste") return;

    const sel = window.getSelection();
    // Lo seleccionado se sustituye, así que no cuenta como espacio ocupado.
    const reemplaza = sel && !sel.isCollapsed ? sel.toString().length : 0;
    const entra = ev.data?.length ?? 1;
    const largo = leerDelDom(el).reduce((n, p) => n + p.t.length, 0);

    if (largo - reemplaza + entra > maxLength) ev.preventDefault();
  };

  const boton =
    "flex h-9 min-w-9 items-center justify-center rounded-md px-2.5 text-sm transition-colors " +
    "hover:bg-muted disabled:opacity-40";

  return (
    <div className={className}>
      {/* La barra va ARRIBA del campo: abajo quedaría tapada por el teclado del
          móvil justo cuando hace falta. */}
      <div
        className="flex flex-wrap items-center gap-x-1 gap-y-1.5 rounded-t-md border border-b-0 border-input bg-muted/40 px-2 py-1.5"
        role="toolbar"
        aria-label="Formato del texto"
      >
        <button
          type="button"
          className={`${boton} gap-1.5 ${marcas.b ? "bg-background shadow-sm ring-1 ring-border" : ""}`}
          aria-label="Negrita"
          aria-pressed={marcas.b}
          title="Negrita"
          // `onPointerDown` con `preventDefault`, y NO `onClick` a secas: sin
          // esto el botón se lleva el foco, el campo PIERDE LA SELECCIÓN y no
          // queda nada que formatear. Es el fallo clásico de esta interfaz.
          onPointerDown={(e) => { e.preventDefault(); alternarNegrita(); }}
        >
          <Bold size={15} />
          <span className="hidden sm:inline">Negrita</span>
        </button>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        {/* El rótulo importa: sin él son cinco círculos sueltos y nadie sabe
            que son colores del texto ni que el primero es para quitarlo. */}
        <span className="mr-0.5 text-xs text-muted-foreground">Color:</span>

        {COLORES.map((c) => {
          const activo = marcas.c === c.valor;
          return (
            <button
              key={c.nombre}
              type="button"
              // 36 px de lado: es el mínimo que se acierta con el pulgar.
              className={
                "flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-muted " +
                (activo ? "bg-background shadow-sm ring-1 ring-border" : "")
              }
              aria-label={c.valor ? `Color ${c.nombre}` : "Quitar el color"}
              aria-pressed={activo}
              title={c.valor ? c.nombre : "Sin color"}
              onPointerDown={(e) => { e.preventDefault(); ponerColor(c.hex); }}
            >
              {/* El indicador es un ANILLO alrededor del círculo y no un icono
                  al lado: un icono que aparece y desaparece ensancha el botón y
                  la barra entera da un salto cada vez que se elige un color. */}
              <span
                className={
                  "flex h-5 w-5 items-center justify-center rounded-full border " +
                  (activo ? "border-foreground/70 ring-2 ring-foreground/25" : "border-black/20")
                }
                style={{ backgroundColor: c.valor ? c.hex : "transparent" }}
                aria-hidden
              >
                {/* «Sin color» se dibuja hueco y tachado: un círculo relleno de
                    gris se confunde con un color más de la paleta. */}
                {!c.valor && <Ban size={13} className="text-muted-foreground" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <div
          id={id}
          ref={ref}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Descripción del aviso"
          suppressContentEditableWarning
          onInput={() => publicar()}
          onBeforeInput={alEscribir}
          onPaste={alPegar}
          onKeyUp={mirarMarcas}
          onMouseUp={mirarMarcas}
          onFocus={onFocus}
          // `text-base` = 16px: por debajo, iOS hace zoom solo al enfocar el
          // campo y descuadra la pantalla (corregido en la v8.7; no repetirlo).
          className={
            "min-h-[8rem] w-full whitespace-pre-wrap rounded-b-md border border-input " +
            "bg-background px-3 py-2 text-base leading-[1.7] outline-none " +
            "focus-visible:ring-2 focus-visible:ring-ring"
          }
        />
        {vacio && placeholder && (
          // El marcador de posición se pinta encima: un `contenteditable` no
          // tiene `placeholder` propio. `pointer-events-none` para que tocarlo
          // ponga el cursor en el campo, no en este texto.
          <p className="pointer-events-none absolute left-3 top-2 text-base text-muted-foreground">
            {placeholder}
          </p>
        )}
      </div>
    </div>
  );
}

/** `#162950` → `rgb(22,41,80)` sin espacios, para comparar lo que devuelve el navegador. */
function hexRgbSinEspacios(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

export default EditorDeTexto;
