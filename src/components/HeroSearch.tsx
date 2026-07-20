import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategories } from "@/hooks/useCategories";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function HeroSearch() {
  const navigate = useNavigate();
  const categories = useCategories();
  const [cat, setCat] = useState("");
  const [query, setQuery] = useState("");

  const submit = () => {
    const params = new URLSearchParams();
    if (cat) params.set("cat", cat);
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    navigate(`/buscar${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="bg-card/95 backdrop-blur-sm rounded-none p-2 shadow-2xl max-w-3xl w-full hero-search-focus border border-white/20 transition-all">
      <div className="flex flex-col md:flex-row gap-2 md:gap-0 md:items-stretch">
        <Select value={cat || undefined} onValueChange={setCat}>
          {/* `role="combobox"` no toma su nombre del contenido (ARIA: "name from
              author"), así que el texto visible "Categoría" no basta: sin
              aria-label los lectores de pantalla solo anuncian "button". */}
          <SelectTrigger aria-label="Categoría"
            className="md:w-48 h-[52px] border-0 bg-transparent focus:ring-0 focus:ring-offset-0 rounded-none">
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="pl-10 h-[52px] border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base rounded-none"
          />
        </div>
        <Button variant="hero" size="lg" className="h-[52px] px-8 rounded-none" onClick={submit}>
          Buscar
        </Button>
      </div>
    </div>
  );
}
