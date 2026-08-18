// Identidad verificada por Factiliza (RENIEC/SUNAT) del usuario. Se guarda en el
// perfil al comprar saldo o al publicar, y se reutiliza en el comprobante sin
// volver a pedir la verificación en un modal.
import { supabase } from "@/lib/supabase";

export type DocKind = "dni" | "ruc" | "ce" | "pasaporte";

// "Usuario" (persona con DNI/CE) vs "Empresa" (RUC). Si no hay tipo guardado, se
// infiere por la longitud del documento (11 dígitos = RUC = Empresa).
export function personKindLabel(docType?: string | null, docNumber?: string | null): string {
  const t = (docType || "").toLowerCase();
  if (t === "ruc") return "Empresa";
  // Quien compra con carne de extranjeria o pasaporte no pasa por Factiliza:
  // sus datos van tal cual al comprobante, y conviene que se vea de un vistazo.
  if (t === "ce" || t === "pasaporte") return "Extranjero";
  if (t === "dni") return "Usuario";
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
  if (t === "pasaporte") return "Pasaporte";
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
  /** Correo de la cuenta, como valor inicial para el del comprobante. */
  accountEmail: string;
  /**
   * El documento del perfil pasó por Factiliza. NO es el sello de confianza:
   * ese lo pone el equipo de administración (profiles.verified) y es el que se
   * enseña en las tarjetas de aviso.
   */
  docVerified: boolean;
}

/**
 * Guarda en el perfil el documento que acaba de pasar por Factiliza, para que
 * la próxima compra —o la próxima publicación— no tenga que volver a
 * verificarlo. Cada verificación es una consulta que se paga.
 *
 * NO se toca `profiles.verified`: ese es el sello de confianza que decide el
 * equipo de administración y que se enseña en las tarjetas de aviso. Que el
 * documento esté validado se sabe por `doc_number`.
 */
export async function saveMyIdentity(input: {
  docType: DocKind;
  docNumber: string;
  name?: string | null;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !input.docNumber) return;
    const pf: Record<string, unknown> = {
      doc_type: input.docType,
      doc_number: input.docNumber,
    };
    if (input.name) pf.legal_name = input.name;
    const { error } = await supabase.from("profiles").update(pf).eq("id", user.id);
    // Que no se pueda guardar no debe cortar una compra en marcha: como mucho,
    // la próxima vez se vuelve a verificar.
    if (error) console.error("[identity] No se pudo guardar el documento:", error.message);
  } catch (e) {
    console.error("[identity] No se pudo guardar el documento:", e);
  }
}

// Lee la identidad verificada del perfil del usuario actual.
export async function fetchMyIdentity(): Promise<MyIdentity | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("doc_type, doc_number, legal_name, company_name, full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (!data) return null;
    const perfil = data as {
      doc_type?: DocKind | null; doc_number?: string | null;
      legal_name?: string | null; company_name?: string | null; full_name?: string | null;
    };
    const docType = perfil.doc_type ?? null;
    const name =
      perfil.legal_name ||
      (docType === "ruc" ? perfil.company_name : null) ||
      perfil.full_name ||
      "";
    const docNumber = perfil.doc_number ?? null;
    return {
      docType,
      docNumber,
      name,
      accountEmail: user.email ?? "",
      // El número solo se guarda tras una consulta correcta a Factiliza, así que
      // tenerlo ES la prueba de que el documento se validó.
      docVerified: !!docNumber,
    };
  } catch {
    return null;
  }
}
