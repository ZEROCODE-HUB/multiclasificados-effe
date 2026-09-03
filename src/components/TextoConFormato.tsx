import { claseDeColor, type TextoConFormato as Formato } from "@/lib/textoConFormato";

/**
 * Pinta una descripción con formato.
 *
 * Esto lo ejecuta TODO visitante que abre un aviso, así que es a propósito la
 * pieza más simple del asunto: recorre fragmentos y devuelve `<span>`s.
 *
 * NO HAY `dangerouslySetInnerHTML` NI LO HABRÁ. Es lo que hace que un anunciante
 * no pueda inyectar nada: el texto de cada fragmento entra como texto de React,
 * que escapa siempre. Si algún día hace falta una marca más, se añade aquí una
 * clase, nunca una etiqueta que venga de los datos.
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
        const clases = [p.b ? "font-bold" : "", p.c ? claseDeColor(p.c) : ""]
          .filter(Boolean)
          .join(" ");
        // Sin marcas no se envuelve en nada: un `<span>` vacío por cada trozo de
        // texto normal solo engorda el árbol.
        return clases
          ? <span key={i} className={clases}>{p.t}</span>
          : <span key={i}>{p.t}</span>;
      })}
    </span>
  );
}

export default TextoConFormato;
