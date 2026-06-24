import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { fetchMyProfile, updateMyProfile, type MyProfile } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

const SettingsPage = ({ role }: { role: "anunciante" | "buscador" }) => {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMyProfile().then((p) => {
      if (!p) return;
      setProfile(p);
      const parts = (p.full_name || "").trim().split(/\s+/);
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
      setPhone(p.phone ?? "");
    });
  }, []);

  const initials = profile?.full_name
    ? profile.full_name.trim().split(/\s+/).map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : role === "anunciante" ? "JM" : "AG";

  const save = async () => {
    if (!profile) { toast({ title: "Inicia sesión para editar tu perfil." }); return; }
    setSaving(true);
    try {
      await updateMyProfile({ full_name: `${firstName} ${lastName}`.trim(), phone });
      toast({ title: "Cambios guardados", description: "Tu información se actualizó correctamente." });
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e?.message ?? "Error", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
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
                    {initials}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" size="sm">Cambiar foto</Button>
                    {/* Estado de verificación de la cuenta (dato real de Supabase) */}
                    {profile?.verified ? (
                      <Badge variant="outline" className="gap-1 bg-secondary/15 text-secondary border-secondary/30 w-fit">
                        <BadgeCheck size={14} /> Cuenta verificada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-muted-foreground w-fit">
                        <ShieldAlert size={14} /> Sin verificar
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Aviso explicativo según el estado de verificación */}
                {profile && !profile.verified && (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
                    Tu cuenta aún <b>no está verificada</b>. La verificación la realiza el equipo de
                    administración; cuando se complete, verás aquí el sello <b>Cuenta verificada</b>.
                  </div>
                )}
                {profile?.verified && (
                  <div className="rounded-lg border border-secondary/30 bg-secondary/10 p-3 text-sm text-foreground flex items-center gap-2">
                    <BadgeCheck size={16} className="text-secondary flex-shrink-0" />
                    Tu identidad fue verificada. Tu perfil muestra el sello de confianza.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nombre</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label>Apellido</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Correo electrónico</Label>
                  <Input value={profile?.email ?? ""} readOnly disabled className="mt-1" />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+51 999 888 777" className="mt-1" />
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
                <Button variant="hero" onClick={save} disabled={saving}>
                  {saving ? "Guardando..." : "Guardar cambios"}
                </Button>
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
};

export default SettingsPage;
