import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Bell, BellOff, Clock, Search, Trash2, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { categories } from "@/data/mockData";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  fetchSavedSearches, deleteSavedSearch, setAlertEnabled, countResults,
  criteriaToSearchUrl, criteriaLabel, type SavedSearch,
} from "@/lib/savedSearches";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const catName = (id?: string) => (id ? categories.find((c) => c.id === id)?.name ?? id : "Todas");

const SeekerSearches = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchSavedSearches().then((rows) => {
      setItems(rows);
      setLoading(false);
      // Conteo de resultados actuales por búsqueda (en paralelo).
      rows.forEach((s) => {
        countResults(s.criteria).then((n) =>
          setCounts((prev) => ({ ...prev, [s.id]: n }))
        );
      });
    });
  }, []);

  const toggleAlert = async (s: SavedSearch) => {
    const next = !s.alert_enabled;
    setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, alert_enabled: next } : x)));
    try {
      await setAlertEnabled(s.id, next);
      toast({ title: next ? "Alerta activada" : "Alerta desactivada" });
    } catch {
      setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, alert_enabled: !next } : x)));
      toast({ title: "No se pudo actualizar la alerta", variant: "destructive" });
    }
  };

  const remove = async (s: SavedSearch) => {
    setItems((prev) => prev.filter((x) => x.id !== s.id));
    try {
      await deleteSavedSearch(s.id);
      toast({ title: "Búsqueda eliminada", description: s.name ?? "" });
    } catch {
      toast({ title: "No se pudo eliminar", variant: "destructive" });
      fetchSavedSearches().then(setItems);
    }
  };

  return (
    <DashboardLayout role="buscador">
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mis búsquedas</h1>
            <p className="text-muted-foreground">Guarda tus filtros y recibe alertas de nuevos avisos.</p>
          </div>
          <Button variant="hero" className="gap-2 self-start sm:self-auto" onClick={() => navigate("/buscar")}>
            <Search size={16} /> Nueva búsqueda
          </Button>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg space-y-2">
              <p className="text-sm">No tienes búsquedas guardadas.</p>
              <p className="text-xs">Ve al buscador, aplica filtros y pulsa <span className="font-semibold text-foreground">"Guardar búsqueda"</span>.</p>
              <Button variant="outline" size="sm" className="mt-1 gap-2" onClick={() => navigate("/buscar")}>
                <Search size={14} /> Ir al buscador
              </Button>
            </div>
          ) : (
            items.map((s) => (
              <Card key={s.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                      <Search size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{s.name || criteriaLabel(s.criteria)}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-xs">{catName(s.criteria.category)}</Badge>
                        <span className="text-xs text-muted-foreground">{criteriaLabel(s.criteria)}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock size={10} /> Guardada {fmtDate(s.created_at)}
                        </span>
                      </div>
                      {/* Alerta */}
                      <div className="flex items-center gap-2 mt-3">
                        <Switch checked={s.alert_enabled} onCheckedChange={() => toggleAlert(s)} />
                        <span className="text-xs font-medium text-foreground flex items-center gap-1">
                          {s.alert_enabled ? <Bell size={12} className="text-secondary" /> : <BellOff size={12} className="text-muted-foreground" />}
                          {s.alert_enabled ? "Alertas activas" : "Alertas desactivadas"}
                        </span>
                        {s.last_notified_at && (
                          <span className="text-[11px] text-muted-foreground hidden sm:inline">· Última alerta {fmtDate(s.last_notified_at)}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Badge className="bg-secondary text-secondary-foreground">
                        {counts[s.id] != null ? `${counts[s.id]} resultados` : "…"}
                      </Badge>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ejecutar búsqueda"
                          onClick={() => navigate(criteriaToSearchUrl(s.criteria))}
                        >
                          <Play size={14} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive" title="Eliminar">
                              <Trash2 size={14} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar esta búsqueda?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se eliminará "{s.name || criteriaLabel(s.criteria)}" y dejarás de recibir sus alertas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(s)}>Eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SeekerSearches;
