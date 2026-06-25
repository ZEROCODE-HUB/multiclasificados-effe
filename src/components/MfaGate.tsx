// Puerta de seguridad del staff: hCaptcha + 2FA (TOTP) antes de entrar al panel.
import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Loader2, KeyRound } from "lucide-react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getMfaState, enrollTotp, verifyTotp, type TotpEnrollment } from "@/lib/mfa";
import { signOut } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Llave de sitio de hCaptcha (de prueba por defecto; real vía VITE_HCAPTCHA_SITE_KEY).
const HCAPTCHA_SITE_KEY =
  (import.meta.env.VITE_HCAPTCHA_SITE_KEY as string) || "10000000-ffff-ffff-ffff-000000000001";

export function MfaGate({ onVerified }: { onVerified: () => void }) {
  const [mode, setMode] = useState<"loading" | "enroll" | "verify">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);

  useEffect(() => {
    getMfaState().then(async (m) => {
      if (m.hasVerifiedTotp && m.factorId) {
        setFactorId(m.factorId);
        setMode("verify");
      } else {
        try {
          const e = await enrollTotp();
          setEnrollment(e);
          setFactorId(e.factorId);
          setMode("enroll");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo iniciar el 2FA.");
        }
      }
    });
  }, []);

  const submit = async () => {
    if (!captchaToken) {
      toast.error("Completa el captcha de seguridad.");
      return;
    }
    if (!factorId || code.trim().length < 6) {
      toast.error("Ingresa el código de 6 dígitos.");
      return;
    }
    setBusy(true);
    try {
      // 1) Verifica el captcha (anti-bot) en el servidor.
      const { data: cap } = await supabase.functions.invoke("verify-captcha", {
        body: { token: captchaToken },
      });
      if (!cap?.success) {
        toast.error("Captcha inválido. Inténtalo de nuevo.");
        captchaRef.current?.resetCaptcha();
        setCaptchaToken(null);
        return;
      }
      // 2) Verifica el 2FA (sube la sesión a AAL2).
      await verifyTotp(factorId, code);
      toast.success("Verificación correcta");
      onVerified();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Código incorrecto. Intenta de nuevo.");
      setCode("");
      captchaRef.current?.resetCaptcha();
      setCaptchaToken(null);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    await signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="max-w-md w-full bg-card border rounded-2xl p-8 shadow-sm">
        <div className="w-14 h-14 rounded-full bg-secondary/15 text-secondary flex items-center justify-center mx-auto mb-4">
          <ShieldCheck size={26} />
        </div>
        <h1 className="text-xl font-extrabold text-foreground text-center">
          {mode === "verify" ? "Verificación en dos pasos" : "Activa la verificación en dos pasos"}
        </h1>
        <p className="text-sm text-muted-foreground text-center mt-2">
          {mode === "verify"
            ? "Ingresa el código de 6 dígitos de tu app de autenticación."
            : "El panel de administración requiere 2FA. Escanea el código QR con Google Authenticator, Authy o similar."}
        </p>

        {mode === "loading" && (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-secondary" size={28} /></div>
        )}

        {mode === "enroll" && enrollment && (
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="bg-white p-3 border rounded-lg">
              {/* qr_code de Supabase viene como imagen (data URI/SVG) */}
              <img src={enrollment.qr} alt="Código QR 2FA" className="w-44 h-44" />
            </div>
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">¿No puedes escanear?</p>
              <code className="text-xs font-mono break-all text-foreground">{enrollment.secret}</code>
            </div>
          </div>
        )}

        {(mode === "enroll" || mode === "verify") && (
          <div className="mt-6 space-y-3">
            <div>
              <Label className="text-xs">Código de 6 dígitos</Label>
              <Input
                inputMode="numeric"
                autoFocus
                placeholder="123456"
                className="mt-1 text-center text-lg tracking-[0.4em] font-bold"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                maxLength={6}
              />
            </div>
            <div className="flex justify-center">
              <HCaptcha
                ref={captchaRef}
                sitekey={HCAPTCHA_SITE_KEY}
                onVerify={(t) => setCaptchaToken(t)}
                onExpire={() => setCaptchaToken(null)}
              />
            </div>
            <Button className="w-full gap-2" onClick={submit} disabled={busy || code.length < 6 || !captchaToken}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
              {mode === "enroll" ? "Activar y continuar" : "Verificar"}
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={cancel}>
              Cerrar sesión
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
