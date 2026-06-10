import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Bell, Trash2, Plus } from "lucide-react";

const alerts = [
  { id: 1, criteria: "Departamentos en Miraflores < USD 1,000", frequency: "Diaria", newResults: 3, active: true },
  { id: 2, criteria: "Autos Toyota < USD 20,000", frequency: "Semanal", newResults: 1, active: true },
  { id: 3, criteria: "Empleos React en Lima", frequency: "Inmediata", newResults: 5, active: true },
  { id: 4, criteria: "iPhones en oferta", frequency: "Semanal", newResults: 0, active: false },
];

const SeekerAlerts = () => (
  <DashboardLayout role="buscador">
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Alertas</h1>
          <p className="text-sm text-muted-foreground">Recibe notificaciones de avisos que coincidan con tus criterios.</p>
        </div>
        <Button variant="hero" className="gap-2 self-start sm:self-auto">
          <Plus size={16} /> Nueva alerta
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {alerts.map((alert) => (
          <Card key={alert.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-lg flex-shrink-0 ${
                    alert.active ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Bell size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-foreground text-sm leading-snug break-words">
                      {alert.criteria}
                    </p>
                    {alert.newResults > 0 && (
                      <Badge className="bg-secondary text-secondary-foreground text-[10px] flex-shrink-0">
                        {alert.newResults} nuevos
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Frecuencia: {alert.frequency}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch defaultChecked={alert.active} />
                      {alert.active ? "Activa" : "Inactiva"}
                    </label>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 gap-1.5">
                      <Trash2 size={14} /> Eliminar
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </DashboardLayout>
);

export default SeekerAlerts;
