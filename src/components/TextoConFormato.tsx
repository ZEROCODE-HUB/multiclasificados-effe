import { esColorValido, type TextoConFormato as Formato } from "@/lib/textoConFormato";

/**
 * Pinta una descripción con formato.
 *
 * Esto lo ejecuta TODO visitante que abre un aviso, así que es a propósito la
 * pieza más simple del asunto: recorre fragmentos y devuelve `<span>`s.
 *
 * NO HAY `dangerouslySetInnerHTML` NI LO HABRÁ. Es lo que hace que un anunciante
 * no pueda inyectar nada: el texto de cada fragmento entra como texto de React,
 * que escapa siempre.
 *
 * ── EL COLOR VA EN UN `style`, Y POR QUÉ ESO SIGUE SIENDO SEGURO ─────
 *
 * Desde que se admite cualquier tono, el color no puede salir de una tabla de
 * clases de Tailwind: hay dieciséis millones. Va en `style={{ color }}`, que es
 * la última barrera y por eso el valor se comprueba ANTES contra `#rrggbb`.
 *
 * Lo que hace esto seguro no es el `style`, es que React asigna la propiedad por
 * el objeto de estilo (`el.style.color = ...`) en lugar de componer un atributo
 * de texto. Un valor con `;` o con `}` no cierra nada ni añade otra propiedad:
 * el navegador lo rechaza entero y el trozo se queda sin color. Aun así se
 * valida antes, porque una barrera que depende de un detalle de React es una
 * barrera prestada.
 *
 * Sin formato, pinta el texto plano. Un solo componente para los dos casos, para
 * que la ficha no tenga que decidir cuál usar.
 */
export function TextoConFormato({
  formato,
  texto,
  className,
}: {
  formato?: Formato | null;
  texto: string;
  className?: string;
}) {
  // `whitespace-pre-line` va en el contenedor: los saltos de línea viven dentro
  // del texto de los fragmentos, igual que en la descripción de siempre.
  if (!formato || formato.length === 0) {
    return <span className={className}>{texto}</span>;
  }

  return (
    <span className={className}>
      {formato.map((p, i) => {
        // Un color que no encaje en `#rrggbb` se DESCARTA. La base ya lo rechaza
        // y `validar` también, pero aquí es donde se pinta, y lo que se pinta no
        // se fía de lo que le llega.
        const color = esColorValido(p.c) ? p.c : undefined;
        // Sin marcas no se envuelve en nada: un `<span>` vacío por cada trozo de
        // texto normal solo engorda el árbol.
        if (!p.b && !color) return <span key={i}>{p.t}</span>;
        return (
          <span key={i} className={p.b ? "font-bold" : undefined} style={color ? { color } : undefined}>
            {p.t}
          </span>
        );
      })}
    </span>
  );
}

export default TextoConFormato;
