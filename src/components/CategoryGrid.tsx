import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCategoryCounts } from "@/lib/stats";
import { useCategories } from "@/hooks/useCategories";
import { categoryPhoto } from "@/lib/categories";
import { imgUrlCover, imgSrcSetCover } from "@/lib/imageUrl";

// Las tarjetas se muestran a ~300×225 CSS. Antes se pedían siempre a 800×600 y
// el navegador tiraba el resto: ~80-110 KiB desperdiciados por imagen. Varios
// escalones para que baje solo el que necesita según el ancho de la tarjeta y
// la densidad de pantalla: sin el de 400 saltaba al de 600 en pantallas
// normales, descargando casi el doble de lo necesario. El de 200 es para
// pantallas de densidad 1 (IT3-006): ahí la tarjeta móvil mide ~178 px y el
// escalón de 300 sobraba.
const GRID_WIDTHS = [200, 300, 400, 600, 800];

// Estas fotos van en escala de grises, bajo un degradado y con texto encima, así
// que aguantan más compresión que la de un aviso (IT3-003/006).
const GRID_QUALITY = 65;

export function CategoryGrid() {
  const categories = useCategories();
  // Conteo real de avisos activos por categoría (desde la BD).
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    fetchCategoryCounts().then(setCounts);
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-border border border-border overflow-hidden shadow-sm">
      {categories.map((cat, i) => {
        // La foto la define el staff en el panel; si la categoría no tiene una
        // propia, `categoryPhoto` devuelve una de reserva (nunca queda vacía).
        const photo = categoryPhoto(cat, i);
        return (
        // <Link> y no <a href>: dentro del WebView de Capacitor un enlace normal
        // recarga la app entera (pantalla en blanco y estado perdido).
        <Link
          key={cat.id}
          to={`/buscar?cat=${cat.id}`}
          className="group relative bg-card hover:bg-card transition-colors cursor-pointer overflow-hidden"
        >
          <div className="relative aspect-[4/3] overflow-hidden">
            <img
              src={imgUrlCover(photo, 300, 0.75, GRID_QUALITY)}
              srcSet={imgSrcSetCover(photo, GRID_WIDTHS, 0.75, GRID_QUALITY)}
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
              width={300}
              height={225}
              alt={cat.name}
              // Las primeras tarjetas están above-the-fold: una de ellas es el
              // elemento LCP en móvil. Cargarlas eager + con prioridad evita el
              // retraso de descarga que penalizaba el LCP (IT2-010). El resto va
              // lazy para no competir por ancho de banda.
              loading={i < 4 ? "eager" : "lazy"}
              fetchPriority={i < 4 ? "high" : "auto"}
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-[1.08]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/30 to-transparent" />
            {/* Flecha de hover: solo donde hay puntero real. En una pantalla
                táctil el :hover se queda "pegado" al arrastrar el dedo por la
                portada y aparecía una flechita fantasma sobre las tarjetas. */}
            <div className="hidden [@media(hover:hover)]:flex absolute top-3 right-3 w-8 h-8 rounded-full bg-secondary text-secondary-foreground items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
              <ArrowUpRight size={14} />
            </div>
            {/* Footer info. El rótulo "Categoría" con su icono se quitó: era
                obvio por contexto y le robaba sitio al nombre. */}
            <div className="absolute bottom-0 left-0 right-0 p-4 text-primary-foreground">
              {/* La caja de altura fija va en el DIV y el recorte en el H3: el
                  `line-clamp` no puede convivir con `flex` en el mismo elemento
                  (usa display:-webkit-box y el flex lo pisa), y por eso los
                  nombres largos ("Insumos, Materias Primas y Materiales") se
                  salían de la tarjeta en vez de cortarse con puntos suspensivos.
                  El min-height mantiene alineados los títulos de una y dos
                  líneas entre tarjetas vecinas (IT2-033). */}
              <div className="flex items-end min-h-[2.8rem] md:min-h-[3.1rem]">
                <h3 className="text-lg md:text-xl font-extrabold tracking-tight leading-tight line-clamp-2">{cat.name}</h3>
              </div>
              <p className="text-[11px] text-primary-foreground/70 mt-1">{(counts[cat.id] ?? 0).toLocaleString()} avisos activos</p>
            </div>
          </div>
        </Link>
        );
      })}
    </div>
  );
}
