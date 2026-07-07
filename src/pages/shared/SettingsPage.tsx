import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BadgeCheck, ShieldAlert, Loader2 } from "lucide-react";
import { fetchMyProfile, updateMyProfile, uploadMyAvatar, type MyProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

const SettingsPage = ({ role }: { role: "anunciante" | "buscador" }) => {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyRuc, setCompanyRuc] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  // Cambio de contraseña (pestaña Seguridad).
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confPwd, setConfPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  // Alto del teclado en móvil: se usa como espacio inferior para que los
  // últimos campos (datos de empresa) puedan subir por encima del teclado.
  const [kbPad, setKbPad] = useState(0);

  useEffect(() => {
    fetchMyProfile().then((p) => {
      if (!p) return;
      setProfile(p);
      const parts = (p.full_name || "").trim().split(/\s+/);
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
      setPhone(p.phone ?? "");
      setCompanyName(p.company_name ?? "");
      setCompanyRuc(p.company_ruc ?? "");
      setAvatarUrl(p.avatar_url ?? "");
    });
  }, []);

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Archivo no válido", description: "Selecciona una imagen.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagen muy pesada", description: "La foto no debe superar 2 MB.", variant: "destructive" });
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await uploadMyAvatar(file);
      setAvatarUrl(url);
      toast({ title: "Foto actualizada", description: "Tu foto de perfil se guardó correctamente." });
    } catch (e: any) {
      toast({ title: "No se pudo subir la foto", description: e?.message ?? "Error", variant: "destructive" });
    }
    setUploadingPhoto(false);
  };

  // Cambia la contraseña: verifica la actual reautenticando y luego actualiza.
  const changePassword = async () => {
    if (!curPwd) {
      toast({ title: "Falta la contraseña actual", variant: "destructive" });
      return;
    }
    if (newPwd.length < 8) {
      toast({ title: "Contraseña muy corta", description: "La nueva contraseña debe tener al menos 8 caracteres.", variant: "destructive" });
      return;
    }
    if (newPwd !== confPwd) {
      toast({ title: "Las contraseñas no coinciden", description: "La nueva contraseña y su confirmación deben ser iguales.", variant: "destructive" });
      return;
    }
    setChangingPwd(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email;
      if (!email) throw new Error("No hay una sesión activa.");
      // Verifica que la contraseña actual sea correcta reautenticando.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: curPwd });
      if (reauthErr) {
        toast({ title: "Contraseña actual incorrecta", description: "Verifica tu contraseña actual e inténtalo de nuevo.", variant: "destructive" });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast({ title: "Contraseña actualizada", description: "Tu nueva contraseña ya está activa." });
      setCurPwd(""); setNewPwd(""); setConfPwd("");
    } catch (e: any) {
      toast({ title: "No se pudo actualizar la contraseña", description: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setChangingPwd(false);
    }
  };

  // Móvil (Capacitor): al abrir/cerrar el teclado, reservamos abajo el alto del
  // teclado como espacio para poder desplazar cualquier campo por encima de él.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handles: Array<{ remove: () => void }> = [];
    const onShow = (info: { keyboardHeight: number }) => setKbPad(info.keyboardHeight || 0);
    const onHide = () => setKbPad(0);
    Keyboard.addListener("keyboardWillShow", onShow).then((h) => handles.push(h));
    Keyboard.addListener("keyboardDidShow", onShow).then((h) => handles.push(h));
    Keyboard.addListener("keyboardWillHide", onHide).then((h) => handles.push(h));
    Keyboard.addListener("keyboardDidHide", onHide).then((h) => handles.push(h));
    return () => { handles.forEach((h) => h.remove()); };
  }, []);

  // Cuando el teclado aparece, desplaza el campo enfocado al centro de la parte
  // visible para que no quede tapado por el teclado.
  const scrollFocusedIntoView = (e: React.FocusEvent<HTMLElement>) => {
    const el = e.target;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      // Retraso para esperar a que el teclado termine de abrirse y se aplique el espacio.
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    }
  };

  const initials = profile?.full_name
    ? profile.full_name.trim().split(/\s+/).map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "";

  const save = async () => {
    if (!profile) { toast({ title: "Inicia sesión para editar tu perfil." }); return; }
    setSaving(true);
    try {
      await updateMyProfile({
        full_name: `${firstName} ${lastName}`.trim(),
        phone,
        ...(role === "anunciante" ? { company_name: companyName.trim(), company_ruc: companyRuc.trim() } : {}),
      });
      toast({ title: "Cambios guardados", description: "Tu información se actualizó correctamente." });
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e?.message ?? "Error", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <DashboardLayout role={role}>
      <div
        className="space-y-6 animate-fade-in max-w-2xl"
        onFocusCapture={scrollFocusedIntoView}
        style={kbPad ? { paddingBottom: kbPad + 24 } : undefined}
      >
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
                  <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center text-secondary text-2xl font-bold overflow-hidden shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={photoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { onPickPhoto(e.target.files?.[0]); if (photoRef.current) photoRef.current.value = ""; }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => photoRef.current?.click()}
                      disabled={uploadingPhoto || !profile}
                      className="gap-2"
                    >
                      {uploadingPhoto ? <><Loader2 size={14} className="animate-spin" /> Subiendo…</> : "Cambiar foto"}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">JPG o PNG, hasta 2 MB.</p>
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
                      <Input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Ej. Inmobiliaria Pacífico SAC"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>RUC</Label>
                      <Input
                        value={companyRuc}
                        onChange={(e) => setCompanyRuc(e.target.value.replace(/\D/g, ""))}
                        inputMode="numeric"
                        maxLength={11}
                        placeholder="20123456789"
                        className="mt-1"
                      />
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
                  <Label htmlFor="cur-pwd">Contraseña actual</Label>
                  <Input
                    id="cur-pwd"
                    type="password"
                    placeholder="••••••••"
                    className="mt-1"
                    autoComplete="current-password"
                    value={curPwd}
                    onChange={(e) => setCurPwd(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="new-pwd">Nueva contraseña</Label>
                  <Input
                    id="new-pwd"
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    className="mt-1"
                    autoComplete="new-password"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="conf-pwd">Confirmar contraseña</Label>
                  <Input
                    id="conf-pwd"
                    type="password"
                    placeholder="Repite la contraseña"
                    className="mt-1"
                    autoComplete="new-password"
                    value={confPwd}
                    onChange={(e) => setConfPwd(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !changingPwd) changePassword(); }}
                  />
                </div>
                <Button variant="hero" onClick={changePassword} disabled={changingPwd}>
                  {changingPwd ? <><Loader2 size={16} className="animate-spin mr-2" /> Actualizando…</> : "Actualizar contraseña"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
