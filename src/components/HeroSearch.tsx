import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categories } from "@/data/mockData";

export function HeroSearch() {
  return (
    <div className="bg-card/95 backdrop-blur-sm rounded-xl p-4 md:p-6 shadow-xl max-w-3xl w-full mx-auto">
      <div className="flex flex-col md:flex-row gap-3">
        <Select>
          <SelectTrigger className="md:w-48">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            placeholder="¿Qué estás buscando?"
            className="pl-10"
          />
        </div>
        <Button variant="hero" size="lg">
          Buscar
        </Button>
      </div>
    </div>
  );
}
