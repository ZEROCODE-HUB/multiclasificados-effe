import { categories } from "@/data/mockData";

export function CategoryGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
      {categories.map((cat) => (
        <a
          key={cat.id}
          href={`/buscar?cat=${cat.id}`}
          className="flex flex-col items-center gap-2 p-4 bg-card rounded-lg border hover:border-secondary hover:shadow-md transition-all group cursor-pointer"
        >
          <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center group-hover:bg-secondary/10 transition-colors">
            <cat.icon className="w-6 h-6 text-accent-foreground group-hover:text-secondary transition-colors" />
          </div>
          <span className="text-xs font-medium text-foreground text-center">{cat.name}</span>
          <span className="text-xs text-muted-foreground">{cat.count.toLocaleString()}</span>
        </a>
      ))}
    </div>
  );
}
