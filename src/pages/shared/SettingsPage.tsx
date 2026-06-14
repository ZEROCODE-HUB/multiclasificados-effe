import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SettingsPage = ({ role }: { role: "anunciante" | "buscador" }) => (
  <DashboardLayout role={role}>
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
        <p className="text-muted-foreground">Gestiona tu cuenta y preferencias.</p>
      </div>

      <Tabs defaultValue="perfil">
        <TabsList>
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil">
          <Card>
            <CardHeader><CardTitle>Información personal</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center text-secondary text-2xl font-bold">
                  {role === "anunciante" ? "JM" : "AG"}
                </div>
                <Button variant="outline" size="sm">Cambiar foto</Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre</Label>
                  <Input defaultValue={role === "anunciante" ? "Juan" : "Ana"} className="mt-1" />
                </div>
                <div>
                  <Label>Apellido</Label>
                  <Input defaultValue={role === "anunciante" ? "Mendoza" : "García"} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Correo electrónico</Label>
                <Input defaultValue={role === "anunciante" ? "juan@empresa.com" : "ana@email.com"} className="mt-1" />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input defaultValue="+51 999 888 777" className="mt-1" />
              </div>
              {role === "anunciante" && (
                <>
                  <Separator />
                  <p className="text-sm font-medium text-secondary">Datos de empresa</p>
                  <div>
                    <Label>Razón social</Label>
                    <Input defaultValue="Inmobiliaria Pacífico SAC" className="mt-1" />
                  </div>
                  <div>
                    <Label>RUC</Label>
                    <Input defaultValue="20123456789" className="mt-1" />
                  </div>
                </>
              )}
              <Button variant="hero">Guardar cambios</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguridad">
          <Card>
            <CardHeader><CardTitle>Seguridad de la cuenta</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Contraseña actual</Label>
                <Input type="password" placeholder="••••••••" className="mt-1" />
              </div>
              <div>
                <Label>Nueva contraseña</Label>
                <Input type="password" placeholder="Mínimo 8 caracteres" className="mt-1" />
              </div>
              <div>
                <Label>Confirmar contraseña</Label>
                <Input type="password" placeholder="Repite la contraseña" className="mt-1" />
              </div>
              <Button variant="hero">Actualizar contraseña</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  </DashboardLayout>
);

export default SettingsPage;
