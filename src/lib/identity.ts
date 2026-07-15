// Identidad verificada por Factiliza (RENIEC/SUNAT) del usuario. Se guarda en el
// perfil al comprar saldo o al publicar, y se reutiliza en el comprobante sin
// volver a pedir la verificación en un modal.
import { supabase } from "@/lib/supabase";

export type DocKind = "dni" | "ruc" | "ce";

// "Usuario" (persona con DNI/CE) vs "Empresa" (RUC). Si no hay tipo guardado, se
// infiere por la longitud del documento (11 dígitos = RUC = Empresa).
export function personKindLabel(docType?: string | null, docNumber?: string | null): string {
  const t = (docType || "").toLowerCase();
  if (t === "ruc") return "Empresa";
  if (t === "dni" || t === "ce") return "Usuario";
  const digits = (docNumber || "").replace(/\D/g, "");
  if (digits.length === 11) return "Empresa";
  if (digits.length > 0) return "Usuario";
  return "—";
}

// Etiqueta del documento según su tipo (DNI / RUC / CE), con respaldo por longitud.
export function docKindLabel(docType?: string | null, docNumber?: string | null): string {
  const t = (docType || "").toLowerCase();
  if (t === "ruc") return "RUC";
  if (t === "ce") return "CE";
  if (t === "dni") return "DNI";
  return (docNumber || "").replace(/\D/g, "").length === 11 ? "RUC" : "DNI";
}

// Convierte la ficha de Factiliza en filas legibles (domicilio, ubigeo, estado
// del RUC, etc.) para mostrarlas en el comprobante. Omite lo vacío.
export function factilizaRows(
  docType: string | null | undefined,
  data: Record<string, unknown> | null | undefined,
): Array<[string, string]> {
  if (!data) return [];
  const get = (k: string): string => {
    const v = data[k];
    if (typeof v === "string") return v.trim();
    if (typeof v === "number") return String(v);
    return "";
  };
  const ubigeo = [get("distrito"), get("provincia"), get("departamento")].filter(Boolean).join(" - ");
  const direccion = get("direccion_completa") || [get("direccion"), ubigeo].filter(Boolean).join(", ");
  const rows: Array<[string, string]> = [];
  const push = (label: string, value: string) => { if (value) rows.push([label, value]); };
  if ((docType || "").toLowerCase() === "ruc") {
    push("Domicilio fiscal", direccion);
    push("Estado", get("estado"));
    push("Condición", get("condicion"));
    push("Tipo contribuyente", get("tipo_contribuyente"));
  } else {
    push("Domicilio", direccion);
    push("Fecha de nacimiento", get("fecha_nacimiento"));
    push("Sexo", get("sexo"));
    push("Estado civil", get("estado_civil"));
  }
  return rows;
}

export interface MyIdentity {
  docType: DocKind | null;
  docNumber: string | null;
  name: string;      // nombre / razón social verificado por Factiliza
  verified: boolean;
}

// Lee la identidad verificada del perfil del usuario actual.
export async function fetchMyIdentity(): Promise<MyIdentity | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("doc_type, doc_number, legal_name, company_name, full_name, verified")
      .eq("id", user.id)
      .maybeSingle();
    if (!data) return null;
    const docType = ((data as any).doc_type as DocKind | null) ?? null;
    const name =
      (data as any).legal_name ||
      (docType === "ruc" ? (data as any).company_name : null) ||
      (data as any).full_name ||
      "";
    return {
      docType,
      docNumber: (data as any).doc_number ?? null,
      name,
      verified: !!(data as any).verified,
    };
  } catch {
    return null;
  }
}
