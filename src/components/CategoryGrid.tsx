import { categories } from "@/data/mockData";

export function CategoryGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
      {categories.map((cat) => (
        <a
          key={cat.id}
          href={`/buscar?cat=${cat.id}`}
          className="flex flex-col items-center gap-3 p-5 bg-card rounded-xl border listing-shadow card-lift hover:border-secondary/40 group cursor-pointer"
        >
          <div className="w-14 h-14 rounded-full bg-accent/80 flex items-center justify-center group-hover:bg-accent transition-colors">
            <cat.icon className="w-7 h-7 text-accent-foreground group-hover:text-secondary transition-colors" />
          </div>
          <span className="text-xs font-semibold text-foreground text-center leading-tight">{cat.name}</span>
          <span className="text-xs text-muted-foreground">{cat.count.toLocaleString()}</span>
        </a>
      ))}
    </div>
  );
}
