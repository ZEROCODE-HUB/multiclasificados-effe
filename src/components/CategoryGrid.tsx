import { categories } from "@/data/mockData";

const images: Record<string, string> = {
  inmuebles: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&h=400&fit=crop",
  vehiculos: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&h=400&fit=crop",
  empleos: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=400&h=400&fit=crop",
  tecnologia: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=400&fit=crop",
  moda: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=400&h=400&fit=crop",
  servicios: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=400&fit=crop",
  educacion: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=400&fit=crop",
  salud: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=400&fit=crop",
};

export function CategoryGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
      {categories.map((cat) => (
        <a
          key={cat.id}
          href={`/buscar?cat=${cat.id}`}
          className="group relative overflow-hidden rounded-xl bg-card border listing-shadow card-lift cursor-pointer aspect-square"
        >
          <img
            src={images[cat.id]}
            alt={cat.name}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/40 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end p-3 text-primary-foreground">
            <p className="text-sm font-bold leading-tight">{cat.name}</p>
            <p className="text-[11px] opacity-80">{cat.count.toLocaleString()} avisos</p>
          </div>
        </a>
      ))}
    </div>
  );
}
