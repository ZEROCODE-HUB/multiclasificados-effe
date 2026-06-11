import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categories } from "@/data/mockData";

export function HeroSearch() {
  return (
    <div className="bg-card/95 backdrop-blur-sm rounded-2xl p-3 md:p-3 shadow-xl max-w-3xl w-full mx-auto hero-search-focus border border-white/20 transition-all">
      <div className="flex flex-col md:flex-row gap-2 md:gap-0 md:items-stretch">
        <Select>
          <SelectTrigger className="md:w-48 h-[52px] border-0 md:border-0 bg-transparent focus:ring-0 focus:ring-offset-0">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="hidden md:block w-px bg-border my-2" />
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            placeholder="¿Qué estás buscando?"
            className="pl-10 h-[52px] border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
          />
        </div>
        <Button variant="hero" size="lg" className="h-[52px] px-8">
          Buscar
        </Button>
      </div>
    </div>
  );
}
