import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Bell, Star, Trash2 } from "lucide-react";

const alerts = [
  { id: 1, criteria: "Departamentos en Miraflores < USD 1,000", frequency: "Diaria", newResults: 3, active: true },
  { id: 2, criteria: "Autos Toyota < USD 20,000", frequency: "Semanal", newResults: 1, active: true },
  { id: 3, criteria: "Empleos React en Lima", frequency: "Inmediata", newResults: 5, active: true },
  { id: 4, criteria: "iPhones en oferta", frequency: "Semanal", newResults: 0, active: false },
];

const SeekerAlerts = () => (
  <DashboardLayout role="buscador">
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Alertas</h1>
          <p className="text-muted-foreground">Recibe notificaciones de nuevos avisos que coincidan con tus criterios.</p>
        </div>
        <Button variant="hero">Nueva alerta</Button>
      </div>

      <div className="space-y-4">
        {alerts.map((alert) => (
          <Card key={alert.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg flex-shrink-0 ${alert.active ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"}`}>
                  <Bell size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{alert.criteria}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">Frecuencia: {alert.frequency}</span>
                  </div>
                </div>
                {alert.newResults > 0 && (
                  <Badge className="bg-secondary text-secondary-foreground">{alert.newResults} nuevos</Badge>
                )}
                <Switch defaultChecked={alert.active} />
                <Button variant="ghost" size="icon" className="text-muted-foreground"><Trash2 size={14} /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </DashboardLayout>
);

export default SeekerAlerts;
