import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchCategoryCounts } from "@/lib/stats";
import { useCategories } from "@/hooks/useCategories";

// Solo el id de la foto: el tamaño se decide abajo, no se fija aquí.
const photos: Record<string, string> = {
  inmuebles: "photo-1560448204-e02f11c3d0e2",
  vehiculos: "photo-1494976388531-d1058494cdd8",
  empleos: "photo-1521737711867-e3b97375f902",
  tecnologia: "photo-1518770660439-4636190af475",
  productos: "photo-1607082348824-0a96f2a4b9da",
  servicios: "photo-1581092918056-0c4c3acd3789",
  "educacion-finanzas": "photo-1503676260728-1c00da094a0b",
  "salud-belleza-moda": "photo-1445205170230-053b83016050",
};

// Las tarjetas se muestran a ~300×225 CSS. Antes se pedían siempre a 800×600 y
// el navegador tiraba el resto: ~80-110 KiB desperdiciados por imagen.
// `auto=format` hace que Unsplash sirva WebP/AVIF si el navegador lo soporta.
const unsplash = (id: string, w: number) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${Math.round(w * 0.75)}&fit=crop&auto=format&q=70`;

// Varios escalones para que el navegador baje solo el que necesita según el
// ancho de la tarjeta y la densidad de pantalla. Sin el de 400 saltaba al de
// 600 en pantallas normales, descargando casi el doble de lo necesario.
const srcSet = (id: string) =>
  [300, 400, 600, 800].map((w) => `${unsplash(id, w)} ${w}w`).join(", ");

export function CategoryGrid() {
  const categories = useCategories();
  // Conteo real de avisos activos por categoría (desde la BD).
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    fetchCategoryCounts().then(setCounts);
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-border border border-border overflow-hidden shadow-sm">
      {categories.map((cat, i) => (
        <a
          key={cat.id}
          href={`/buscar?cat=${cat.id}`}
          className="group relative bg-card hover:bg-card transition-colors cursor-pointer overflow-hidden"
        >
          <div className="relative aspect-[4/3] overflow-hidden">
            {/* Las categorías que cree el staff no tienen foto: cae a un fondo sólido. */}
            {photos[cat.id] ? (
              <img
                src={unsplash(photos[cat.id], 300)}
                srcSet={srcSet(photos[cat.id])}
                sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                width={300}
                height={225}
                alt={cat.name}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 group-hover:scale-[1.08]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/60" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/30 to-transparent" />
            {/* Index marker */}
            <span className="absolute top-3 left-4 text-[10px] font-bold text-primary-foreground/60 tracking-widest">
              {String(i + 1).padStart(2, "0")}
            </span>
            {/* Hover arrow */}
            <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
              <ArrowUpRight size={14} />
            </div>
            {/* Footer info */}
            <div className="absolute bottom-0 left-0 right-0 p-4 text-primary-foreground">
              <div className="flex items-center gap-2 mb-1">
                <cat.icon size={14} className="text-secondary" />
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-secondary">Categoría</span>
              </div>
              <h3 className="text-lg md:text-xl font-extrabold tracking-tight leading-tight">{cat.name}</h3>
              <p className="text-[11px] text-primary-foreground/70 mt-1">{(counts[cat.id] ?? 0).toLocaleString()} avisos activos</p>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
