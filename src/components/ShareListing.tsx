// Compartir un aviso: las opciones del menú y el botón flotante que lo abre.
//
// La lógica de compartir NO está aquí, está en `src/lib/share.ts` (con sus
// pruebas). Esto es solo la interfaz, y vive en un componente propio para que
// los dos accesos —el botón de la fila de acciones y el flotante— ofrezcan
// exactamente las mismas opciones: si mañana se añade una, aparece en ambos.
import { Share2, MessageCircle, Link2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { shareListingWhatsApp, copyListingLink, shareListingSystem, canSystemShare } from "@/lib/share";

type Props = { title: string; listingId: string };

/** Opciones de compartir. Va dentro de un <DropdownMenuContent>. */
export function ShareMenuItems({ title, listingId }: Props) {
  return (
    <>
      <DropdownMenuItem className="gap-2" onClick={() => shareListingWhatsApp(title, listingId)}>
        <MessageCircle size={16} className="text-[#25D366]" /> WhatsApp
      </DropdownMenuItem>
      <DropdownMenuItem
        className="gap-2"
        onClick={async () => {
          const ok = await copyListingLink(listingId);
          toast({
            title: ok ? "Enlace copiado" : "No se pudo copiar",
            description: ok ? "Ya puedes pegarlo donde quieras." : "Inténtalo de nuevo.",
            variant: ok ? undefined : "destructive",
          });
        }}
      >
        <Link2 size={16} /> Copiar enlace
      </DropdownMenuItem>
      {/* La hoja del sistema solo existe en móvil y en algunos navegadores; sin
          ella el usuario ya tiene WhatsApp y copiar, así que no se anuncia. */}
      {canSystemShare() && (
        <DropdownMenuItem className="gap-2" onClick={() => shareListingSystem(title, listingId)}>
          <Share2 size={16} /> Más opciones…
        </DropdownMenuItem>
      )}
    </>
  );
}

// Clases del botón flotante. Aparte, para que la prueba de layout
// (e2e/shareFab.spec.ts) mida las REALES sin montar la ficha entera.
//
// La posición se calcula con `--nav-bottom` y nunca con `env()` a mano (ver
// src/index.css): esa variable ya vale 4rem + el hueco seguro en móvil, que es
// justo el alto de la barra inferior, y solo el hueco seguro desde `lg`, donde
// la barra no se pinta. Así el botón queda encima de la barra y del indicador
// de inicio de iOS sin ninguna cuenta hecha a ojo.
//
// z-30 lo deja por debajo de la barra inferior (z-40), de la cabecera (z-50) y
// de los diálogos (z-50): cualquier modal lo tapa, como debe ser.
export const SHARE_FAB =
  "fixed z-30 right-4 lg:right-6 bottom-[calc(1rem+var(--nav-bottom))] " +
  "h-14 w-14 rounded-full flex items-center justify-center " +
  "bg-secondary text-secondary-foreground shadow-lg shadow-black/25 " +
  "transition-transform hover:scale-105 active:scale-95 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Botón flotante de compartir. Siempre a la vista, en móvil y en escritorio. */
export function ShareFab({ title, listingId }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Compartir este aviso" className={SHARE_FAB}>
          <Share2 size={22} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={12} className="w-52">
        <ShareMenuItems title={title} listingId={listingId} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
