// REQ-10: reportes/denuncias (avisos y usuarios). Insertan en la tabla
// polimórfica `reports`; el panel de moderación los consume vía admin_list_reports.
import { supabase } from "@/lib/supabase";

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

// Reporta un aviso.
export async function reportListing(
  listingId: string,
  category: string,
  detail: string
): Promise<void> {
  const user = await requireUser();
  const reason = [category, detail.trim()].filter(Boolean).join(" — ");
  const { error } = await supabase.from("reports").insert({
    target_type: "listing",
    listing_id: listingId,
    reported_by: user.id,
    reason,
    category,
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
