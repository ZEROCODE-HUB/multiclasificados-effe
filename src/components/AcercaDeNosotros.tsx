import { useEffect, useState } from "react";
import { Target, Eye } from "lucide-react";
import { fetchAcercaDe, ACERCA_DE_POR_DEFECTO, type AcercaDe } from "@/lib/acercaDe";

/**
 * La sección «Acerca de Nosotros». El texto lo edita el administrador desde
 * Comercial → Variables del sistema (migración 0141).
 *
 * EL TEXTO SE PINTA COMO TEXTO, NUNCA COMO HTML.
 *
 * Lo escribe una persona en un campo del panel y lo lee todo el visitante. Con
 * `dangerouslySetInnerHTML` —que es lo que uno pone para que se respeten los
 * saltos de línea sin pensarlo— un administrador despistado que pegue algo que
 * le pasaron estaría metiendo un <script> en la portada. `whitespace-pre-line`
 * respeta los saltos y nada más, que es justo lo que hace falta.
 *
 * Arranca con el texto por defecto y no con un hueco vacío: la sección va en la
 * portada, y un bloque en blanco durante el medio segundo que tarda la consulta
 * se ve como si la página estuviera rota.
 */
export function AcercaDeNosotros({
  className = "",
  /** En la página propia el título va como <h1>; en la portada, como <h2>. */
  comoH1 = false,
}: { className?: string; comoH1?: boolean }) {
  const [datos, setDatos] = useState<AcercaDe>(ACERCA_DE_POR_DEFECTO);

  useEffect(() => {
    let vigente = true;
    fetchAcercaDe().then((d) => { if (vigente) setDatos(d); });
    return () => { vigente = false; };
  }, []);

  const Titulo = comoH1 ? "h1" : "h2";

  return (
    <section className={`container mx-auto px-4 ${className}`} id="acerca-de">
      <div className="max-w-3xl mx-auto">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-secondary text-center">
          Quiénes somos
        </p>
        <Titulo className="text-2xl md:text-3xl font-extrabold text-foreground text-center mt-2">
          {datos.titulo}
        </Titulo>
        <p className="mt-5 text-sm md:text-base leading-relaxed text-muted-foreground whitespace-pre-line text-center">
          {datos.texto}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10">
          <div className="border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-secondary shrink-0" />
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-primary">Misión</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {datos.mision}
            </p>
          </div>
          <div className="border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Eye size={16} className="text-secondary shrink-0" />
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-primary">Visión</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {datos.vision}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default AcercaDeNosotros;
