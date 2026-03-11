import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Search, Trash2, RefreshCw } from "lucide-react";

const searches = [
  { id: 1, query: "Departamento 2 dormitorios Miraflores", category: "Inmuebles", date: "2026-03-10", results: 24, priceRange: "USD 800 - 1,200" },
  { id: 2, query: "Toyota Corolla 2023-2025", category: "Vehículos", date: "2026-03-09", results: 8, priceRange: "USD 18,000 - 25,000" },
  { id: 3, query: "Desarrollador React remoto", category: "Empleos", date: "2026-03-08", results: 15, priceRange: "PEN 5,000 - 10,000" },
  { id: 4, query: "iPhone 15 Pro", category: "Tecnología", date: "2026-03-07", results: 12, priceRange: "PEN 4,000 - 6,000" },
];

const SeekerSearches = () => (
  <DashboardLayout role="buscador">
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mis búsquedas</h1>
        <p className="text-muted-foreground">Búsquedas guardadas y tu historial reciente.</p>
      </div>

      <div className="space-y-4">
        {searches.map((s) => (
          <Card key={s.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                  <Search size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{s.query}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <Badge variant="outline" className="text-xs">{s.category}</Badge>
                    <span className="text-xs text-muted-foreground">{s.priceRange}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={10} /> {s.date}</span>
                  </div>
                </div>
                <Badge className="bg-secondary text-secondary-foreground">{s.results} resultados</Badge>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon"><RefreshCw size={14} /></Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground"><Trash2 size={14} /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </DashboardLayout>
);

export default SeekerSearches;
