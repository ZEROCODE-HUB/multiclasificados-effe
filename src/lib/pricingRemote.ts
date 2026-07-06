// Lee la configuración de tarifas VIGENTE desde la base de datos (fuente de
// verdad que edita el admin) y la cachea en localStorage. Así los cambios del
// admin se reflejan para todos los usuarios, no solo en el navegador donde se
// guardaron. Si algo falla, cae al valor local / por defecto.
import { supabase } from "@/lib/supabase";
import { DEFAULT_SETTINGS, loadSettings, type PricingSettings } from "@/lib/pricing";

const STORAGE_KEY = "effe:pricing-settings";

export async function fetchPricingSettings(): Promise<PricingSettings> {
  try {
    const { data } = await supabase
      .from("pricing_settings")
      .select("base, desc_por_aviso, desc_cantidad, saltos, extras")
      .eq("is_active", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!data) return loadSettings();

    const descCantidad = Array.isArray(data.desc_cantidad) && data.desc_cantidad.length
      ? (data.desc_cantidad as number[])
      : undefined;
    const s: PricingSettings = {
      base: Number(data.base),
      descPorAviso: Number(data.desc_por_aviso),
      descCantidad,
      saltos: { ...DEFAULT_SETTINGS.saltos, ...(data.saltos ?? {}) },
      extras: { ...DEFAULT_SETTINGS.extras, ...(data.extras ?? {}) },
    };
    // Cachea sin disparar eventos (evita recargas en cadena).
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* noop */ }
    return s;
  } catch {
    return loadSettings();
  }
}
