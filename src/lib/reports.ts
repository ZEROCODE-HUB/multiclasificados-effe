// REQ-10: reportes/denuncias (avisos y usuarios). Insertan en la tabla
// polimórfica `reports`; el panel de moderación los consume vía admin_list_reports.
import { supabase } from "@/lib/supabase";
import { verifyDocument } from "@/lib/verifyDoc";

// Motivos predefinidos (categoría del reporte).
export const LISTING_REPORT_REASONS = [
  "Información engañosa o falsa",
  "Posible estafa o fraude",
  "Contenido inapropiado u ofensivo",
  "Producto/servicio prohibido",
  "Publicación duplicada o spam",
  "Precio incorrecto",
  "Otro",
];

export const USER_REPORT_REASONS = [
  "Comportamiento abusivo o acoso",
  "Posible estafador",
  "Suplantación de identidad",
  "Spam o mensajes no deseados",
  "Contenido inapropiado",
  "Otro",
];

async function requireUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión para reportar.");
  return user;
}

/**
 * Quién reporta, con su documento (punto B-10 de la auditoría).
 *
 * `docVerified` es de TRES estados, no dos:
 *   true  → se comprobó y el documento existe.
 *   false → se comprobó y NO existe.
 *   null  → no se pudo comprobar.
 * Quien modera necesita distinguir el último de los otros: un reporte sin
 * verificar no es un reporte con documento falso.
 */
export interface QuienReporta {
  name: string;
  docType: "DNI" | "RUC";
  docNumber: string;
  docVerified: boolean | null;
}

export type ResultadoDocumento =
  | { estado: "existe"; nombre: string }
  | { estado: "no-existe"; mensaje: string }
  | { estado: "no-se-pudo"; mensaje: string };

/**
 * Comprueba el documento de quien va a reportar.
 *
 * FALLA ABIERTO, y es la decisión importante de todo B-10.
 *
 * Solo se devuelve "no-existe" cuando el registro contestó y dijo que ese
 * documento no está. Cualquier otra cosa —el servicio caído, el token caducado,
 * la cuota agotada, una función desplegada antes de que existiera `causa`— es
 * "no-se-pudo", y el reporte entra marcado como no verificado.
 *
 * Al revés, una caída de Factiliza sería un botón de silencio: nadie podría
 * denunciar un aviso fraudulento mientras durase. Un reporte de más lo revisa
 * una persona; un reporte que no se pudo hacer no lo revisa nadie.
 */
export async function comprobarDocumento(
  docType: "DNI" | "RUC",
  docNumber: string,
): Promise<ResultadoDocumento> {
  const r = await verifyDocument(docType === "RUC" ? "ruc" : "dni", docNumber);
  if (r.ok) return { estado: "existe", nombre: r.nombre ?? "" };
  if (r.causa === "no_existe" || r.causa === "entrada") {
    return { estado: "no-existe", mensaje: r.error ?? "No se encontró ese documento." };
  }
  return {
    estado: "no-se-pudo",
    mensaje: r.error ?? "No se pudo comprobar el documento en este momento.",
  };
}

// Reporta un aviso.
export async function reportListing(
  listingId: string,
  category: string,
  detail: string,
  quien?: QuienReporta,
): Promise<void> {
  const user = await requireUser();
  const reason = [category, detail.trim()].filter(Boolean).join(" — ");
  const { error } = await supabase.from("reports").insert({
    target_type: "listing",
    listing_id: listingId,
    reported_by: user.id,
    reason,
    category,
    ...(quien
      ? {
          reporter_name: quien.name.trim() || null,
          reporter_doc_type: quien.docType,
          reporter_doc_number: quien.docNumber.replace(/\D/g, ""),
          reporter_doc_verified: quien.docVerified,
        }
      : {}),
  });
  if (error) throw error;
}

// Reporta a un usuario (anunciante/vendedor).
export async function reportUser(
  targetUserId: string,
  category: string,
  detail: string
): Promise<void> {
  const user = await requireUser();
  if (user.id === targetUserId) throw new Error("No puedes reportarte a ti mismo.");
  const reason = [category, detail.trim()].filter(Boolean).join(" — ");
  const { error } = await supabase.from("reports").insert({
    target_type: "user",
    target_user_id: targetUserId,
    reported_by: user.id,
    reason,
    category,
  });
  if (error) throw error;
}
