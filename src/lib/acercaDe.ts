// El texto de «Acerca de Nosotros», que se edita desde Comercial → Variables
// del sistema (migración 0141).
//
// Mismo planteamiento que `redesSociales.ts`: vive en `system_settings`, lo
// expone una función `security definer` legible sin sesión, y ante cualquier
// fallo se devuelve lo que hay por defecto en vez de dejar un hueco en la
// portada. Una sección vacía se ve rota; una con el texto de siempre, no.
import { supabase } from "@/lib/supabase";

export interface AcercaDe {
  titulo: string;
  texto: string;
  mision: string;
  vision: string;
}

/**
 * Lo que se enseña si la base no responde o la 0141 todavía no está aplicada.
 *
 * Es el MISMO texto que siembra la migración. Está repetido a propósito: si el
 * front no lo tuviera, un fallo de red dejaría la sección en blanco, y esto se
 * pinta en la portada, que es lo primero que ve cualquiera.
 */
export const ACERCA_DE_POR_DEFECTO: AcercaDe = {
  titulo: "Acerca de Nosotros",
  texto:
    "eFFe Multiclasificados es la plataforma peruana de avisos clasificados donde encuentras y publicas inmuebles, vehículos, empleos y servicios.\n\n" +
    "Nacimos para que anunciar sea simple y seguro: un aviso bien hecho, visible desde cualquier lugar del país y con las herramientas para conversar directamente con quien te interesa. Verificamos a los anunciantes, moderamos lo que se publica y acompañamos cada operación con su comprobante.",
  mision:
    "Conectar a las personas y los negocios del Perú con quien los está buscando, de manera simple, segura y profesional.",
  vision:
    "Ser el lugar al que todo el Perú acude cuando quiere comprar, vender, alquilar, contratar o encontrar trabajo.",
};

/** Separado de la llamada para poder probarlo sin base de datos. */
export function normalizarAcercaDe(data: unknown): AcercaDe {
  if (!data || typeof data !== "object") return ACERCA_DE_POR_DEFECTO;
  const crudo = data as Record<string, unknown>;
  const campo = (clave: keyof AcercaDe): string => {
    const v = crudo[clave];
    const texto = typeof v === "string" ? v.trim() : "";
    // Campo a campo y no todo o nada: si el administrador vacía la misión, se
    // recupera esa sola y el resto de lo que escribió se respeta.
    return texto || ACERCA_DE_POR_DEFECTO[clave];
  };
  return {
    titulo: campo("titulo"),
    texto: campo("texto"),
    mision: campo("mision"),
    vision: campo("vision"),
  };
}

export async function fetchAcercaDe(): Promise<AcercaDe> {
  try {
    const { data, error } = await supabase.rpc("acerca_de");
    if (error) throw error;
    return normalizarAcercaDe(data);
  } catch {
    return ACERCA_DE_POR_DEFECTO;
  }
}
