// 2FA / MFA (TOTP) con la API nativa de Supabase.
// Obligatorio para el staff (admin/superadmin): el acceso al panel exige AAL2.
import { supabase } from "@/lib/supabase";

export interface MfaState {
  currentLevel: string | null; // 'aal1' | 'aal2'
  nextLevel: string | null;
  hasVerifiedTotp: boolean;
  factorId: string | null;     // factor verificado (para el challenge en login)
}

export async function getMfaState(): Promise<MfaState> {
  try {
    const [{ data: aal }, { data: factors }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    const verified = (factors?.totp ?? []).find((f) => f.status === "verified");
    return {
      currentLevel: aal?.currentLevel ?? null,
      nextLevel: aal?.nextLevel ?? null,
      hasVerifiedTotp: !!verified,
      factorId: verified?.id ?? null,
    };
  } catch {
    return { currentLevel: null, nextLevel: null, hasVerifiedTotp: false, factorId: null };
  }
}

export interface TotpEnrollment {
  factorId: string;
  qr: string;     // imagen QR (data URI/SVG)
  secret: string; // código manual
}

// Inicia el enrolamiento TOTP. Limpia factores no verificados previos para
// evitar el error "a factor with this friendly name already exists".
export async function enrollTotp(): Promise<TotpEnrollment> {
  try {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.factor_type === "totp" && f.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }
  } catch { /* ignore */ }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error) throw error;
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

// Verifica el código de 6 dígitos (sirve tanto para activar el factor como
// para el challenge en el login; en ambos casos sube la sesión a AAL2).
export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) throw error;
}

export async function unenrollTotp(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
