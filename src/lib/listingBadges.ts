import { Award, Flame, EyeOff, type LucideIcon } from "lucide-react";

// Insignias de los adicionales de un aviso. Colores OFICIALES del documento eFFe
// (Urgente/Destacado/Confidencial): Destacado dorado, Urgente rojo/naranja,
// Confidencial celeste. Se centralizan aquí para que la tarjeta del buscador y
// la página de detalle no se desincronicen.
export interface ListingBadgeDef {
  key: "featured" | "urgent" | "confidential";
  label: string;
  icon: LucideIcon;
  /** Fondo + color de texto de la insignia. */
  cls: string;
}

const ALL: ListingBadgeDef[] = [
  { key: "featured", label: "Destacado", icon: Award, cls: "bg-amber-500 text-white" },
  { key: "urgent", label: "Urgente", icon: Flame, cls: "bg-red-600 text-white" },
  { key: "confidential", label: "Confidencial", icon: EyeOff, cls: "bg-sky-500 text-white" },
];

/** Devuelve solo las insignias que el aviso trae activadas, en orden fijo. */
export function listingBadges(
  l: { featured?: boolean; urgent?: boolean; confidential?: boolean },
): ListingBadgeDef[] {
  return ALL.filter((b) => l[b.key]);
}

// El adicional "Urgente" solo tiene sentido en publicaciones cortas (24 h, 72 h
// o hasta 7 días): su fin es respuesta inmediata. En planes de 15/30/60 días no
// se ofrece.
export const URGENTE_MAX_DAYS = 7;
export const urgenteAllowedFor = (durationDays: number) => durationDays <= URGENTE_MAX_DAYS;

// Aviso CONFIDENCIAL (documento eFFe): la identidad del anunciante permanece
// oculta. En vez del nombre real se muestra una etiqueta genérica.
export const CONFIDENTIAL_ADVERTISER_LABEL = "Anunciante confidencial";
export function advertiserDisplayName(advertiser: string, confidential?: boolean): string {
  return confidential ? CONFIDENTIAL_ADVERTISER_LABEL : advertiser;
}
