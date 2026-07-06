import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { clearSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandMark } from "@/components/BrandMark";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

// Pantalla de "nueva contraseña". Se llega aquí desde el enlace del correo de
// recuperación (Supabase adjunta un token de tipo `recovery` en la URL, que el
// cliente detecta y convierte en una sesión temporal). Con esa sesión activa
// `supabase.auth.updateUser({ password })` fija la clave nueva.
const ResetPassword = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // "checking": esperando a que el token del enlace cree la sesión de recuperación.
  // "ready": hay sesión, se puede cambiar la clave. "invalid": enlace inválido/expirado.
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid">("checking");
  // Motivo cuando el enlace es inválido: distingue "ya usado/expirado" del resto.
  const [reason, setReason] = useState<"expired" | "generic">("generic");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let settled = false;
    const markReady = () => { settled = true; setPhase("ready"); };
    const markInvalid = (why: "expired" | "generic" = "generic") => {
      settled = true; setReason(why); setPhase("invalid");
    };

    // Si Supabase ya rechazó el enlace, vuelve con el error en el hash
    // (#error=access_denied&error_code=otp_expired). Lo detectamos al instante
    // en vez de esperar el timeout: pasa cuando un escáner de correo ya consumió
    // el enlace de un solo uso antes de tu clic.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errCode = hash.get("error_code") || hash.get("error");
    if (errCode) { markInvalid(errCode.includes("expired") || errCode === "access_denied" ? "expired" : "generic"); return; }

    // Caso principal (cross-browser): el enlace del correo trae ?token_hash=...&type=recovery.
    // verifyOtp canjea ese token por una sesión temporal SIN depender de PKCE, así
    // funciona aunque el usuario abra el correo en otro navegador/dispositivo.
    const tokenHash = params.get("token_hash");
    const type = (params.get("type") ?? "recovery") as EmailOtpType;
    if (tokenHash) {
      supabase.auth.verifyOtp({ type, token_hash: tokenHash }).then(({ error }) => {
        if (error) markInvalid("expired"); else markReady();
      });
      return () => { settled = true; };
    }

    // Respaldo: enlaces implícitos/PKCE que ya dejan la sesión en la URL.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) markReady();
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) markReady(); });

    // Salvavidas: si tras unos segundos no hay sesión, el enlace no sirve.
    const timeout = setTimeout(() => { if (!settled) setPhase("invalid"); }, 6000);

    return () => { sub.subscription.unsubscribe(); clearTimeout(timeout); };
  }, [params]);

  const submit = async () => {
    if (password.length < 8) { toast.error("La contraseña debe tener al menos 8 caracteres."); return; }
    if (password !== confirm) { toast.error("Las contraseñas no coinciden."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Contraseña actualizada. Inicia sesión con tu nueva clave.");
      // Cerramos la sesión temporal de recuperación y mandamos al login.
      await supabase.auth.signOut();
      clearSession();
      navigate("/auth", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar la contraseña.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-4">
      <BrandMark size="lg" asLink={false} />

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck size={20} className="text-primary" /> Nueva contraseña
          </CardTitle>
          <p className="text-sm text-muted-foreground">Crea una contraseña segura para tu cuenta.</p>
        </CardHeader>

        <CardContent>
          {phase === "checking" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 size={16} className="animate-spin" /> Validando el enlace…
            </div>
          )}

          {phase === "invalid" && (
            <div className="space-y-4 text-center py-2">
              <p className="text-sm text-muted-foreground">
                {reason === "expired"
                  ? "Este enlace ya se usó o expiró. Los enlaces de recuperación son de un solo uso; algunos proveedores de correo (Gmail, antivirus) los abren automáticamente y los invalidan. Solicita uno nuevo y ábrelo apenas llegue."
                  : "El enlace de recuperación no es válido. Solicita uno nuevo desde el inicio de sesión."}
              </p>
              <Button className="w-full" onClick={() => navigate("/auth", { replace: true })}>
                Ir al inicio de sesión
              </Button>
            </div>
          )}

          {phase === "ready" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Contraseña nueva</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    tabIndex={-1}
                    aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                <Input
                  id="confirm-password"
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                  onKeyDown={(e) => e.key === "Enter" && !saving && submit()}
                />
              </div>

              <Button className="w-full" size="lg" onClick={submit} disabled={saving}>
                {saving ? <><Loader2 size={16} className="animate-spin mr-2" /> Guardando…</> : "Actualizar contraseña"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
