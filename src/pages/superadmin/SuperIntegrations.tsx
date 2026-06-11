import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plug } from "lucide-react";
import { integrations } from "@/data/adminMockData";

const colorMap: Record<string, string> = {
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  muted: "bg-muted text-muted-foreground border-border",
};

const SuperIntegrations = () => (
  <AdminLayout role="superadmin" title="Integraciones" breadcrumb={["Plataforma", "Integraciones"]}>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {integrations.map((i) => (
        <Card key={i.name} className="card-lift">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-xl gradient-secondary text-secondary-foreground flex items-center justify-center">
                <Plug size={20} />
              </div>
              <Badge variant="outline" className={colorMap[i.color]}>{i.status}</Badge>
            </div>
            <p className="font-bold text-foreground">{i.name}</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">{i.desc}</p>
            <Button size="sm" variant="outline" className="w-full">
              {i.status === "Conectado" ? "Configurar" : "Conectar"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  </AdminLayout>
);

export default SuperIntegrations;
