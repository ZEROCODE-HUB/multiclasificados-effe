import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const applications = [
  { id: 1, name: "Pedro Gómez", email: "pedro@email.com", listing: "Desarrollador Full Stack", date: "2026-03-10", status: "pendiente", message: "Tengo 5 años de experiencia en React y Node.js." },
  { id: 2, name: "Laura Díaz", email: "laura@email.com", listing: "Servicio de Mudanzas", date: "2026-03-09", status: "revisado", message: "Cuento con camión propio y equipo de 4 personas." },
  { id: 3, name: "Roberto Silva", email: "roberto@email.com", listing: "Curso de Marketing Digital", date: "2026-03-08", status: "contactado", message: "Me interesa inscribirme en la próxima sesión." },
  { id: 4, name: "Carmen Vega", email: "carmen@email.com", listing: "Desarrollador Full Stack", date: "2026-03-07", status: "rechazado", message: "Tengo experiencia en Angular y Python." },
];

const statusColors: Record<string, string> = {
  pendiente: "bg-warning text-warning-foreground",
  revisado: "bg-primary text-primary-foreground",
  contactado: "bg-success text-success-foreground",
  rechazado: "bg-destructive text-destructive-foreground",
};

const AdvertiserApplications = () => (
  <DashboardLayout role="anunciante">
    <div className="space-y-5 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">Postulaciones</h1>
        <p className="text-sm text-muted-foreground">Revisa y gestiona las postulaciones recibidas.</p>
      </div>

      <Tabs defaultValue="todas">
        <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="todas">Todas (4)</TabsTrigger>
            <TabsTrigger value="pendiente">Pendientes (1)</TabsTrigger>
            <TabsTrigger value="revisado">Revisadas (1)</TabsTrigger>
            <TabsTrigger value="contactado">Contactadas (1)</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="todas" className="mt-4">
          <div className="space-y-3 md:space-y-4">
            {applications.map((app) => (
              <Card key={app.id} className="border-l-4 border-l-secondary/50 hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-full gradient-secondary flex items-center justify-center text-secondary-foreground font-bold flex-shrink-0 shadow-sm">
                      {app.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-semibold text-foreground">{app.name}</p>
                        <Badge className={statusColors[app.status] + " capitalize text-[10px]"}>{app.status}</Badge>
                      </div>
                      <p className="text-xs text-secondary font-medium mb-2">Para: {app.listing}</p>
                      <p className="text-sm text-foreground/80 leading-relaxed">{app.message}</p>
                      <p className="text-[11px] text-muted-foreground mt-2">{app.email} · {app.date}</p>
                      <div className="flex gap-2 mt-3 pt-3 border-t border-dashed">
                        <Button variant="outline" size="sm" className="h-8 text-xs flex-1 sm:flex-initial">Ver perfil</Button>
                        <Button variant="hero" size="sm" className="h-8 text-xs flex-1 sm:flex-initial">Contactar</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        {["pendiente", "revisado", "contactado"].map(status => (
          <TabsContent key={status} value={status} className="mt-4">
            <div className="space-y-3">
              {applications.filter(a => a.status === status).map((app) => (
                <Card key={app.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full gradient-secondary flex items-center justify-center text-secondary-foreground font-bold flex-shrink-0">{app.name.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{app.name}</p>
                        <p className="text-xs text-secondary truncate">{app.listing}</p>
                      </div>
                      <Button variant="hero" size="sm" className="h-8 text-xs">Contactar</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  </DashboardLayout>
);

export default AdvertiserApplications;
