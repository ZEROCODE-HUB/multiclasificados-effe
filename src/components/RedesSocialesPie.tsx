import { useEffect, useState } from "react";
import { Facebook, Instagram, Youtube, Linkedin } from "lucide-react";
import { fetchRedesSociales, NOMBRE_RED, REDES, type Red, type RedesSociales } from "@/lib/redesSociales";

/**
 * Los iconos de redes sociales del pie (punto B-16 de la auditoría).
 *
 * Se pinta solo lo que está configurado: si el cliente todavía no abrió TikTok,
 * no sale un icono de TikTok que no lleva a ningún lado.
 */

/**
 * TikTok no está en lucide-react, así que va a mano.
 *
 * Es el único de los seis que hay que dibujar. Se mantiene el mismo contrato
 * que los iconos de lucide (`size`, `className`, `currentColor`) para que el
 * bucle de abajo los trate a todos igual y no haya un caso especial.
 */
function TikTok({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="currentColor" className={className} aria-hidden="true" focusable="false"
    >
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1 0-5.18c.27 0 .52.04.76.12v-3.2a5.83 5.83 0 0 0-.76-.05 5.72 5.72 0 1 0 5.72 5.72V9.01a7.35 7.35 0 0 0 4.29 1.37V7.3a4.3 4.3 0 0 1-3.27-1.48z" />
    </svg>
  );
}

type Pintor = (p: { size?: number; className?: string }) => JSX.Element;

const ICONO: Record<Red, Pintor> = {
  facebook: (p) => <Facebook {...p} />,
  instagram: (p) => <Instagram {...p} />,
  tiktok: (p) => <TikTok {...p} />,
  youtube: (p) => <Youtube {...p} />,
  linkedin: (p) => <Linkedin {...p} />,
  // WhatsApp tampoco está en lucide. Su glifo es reconocible de sobra, así que
  // se dibuja igual que TikTok en vez de usar un bocadillo genérico, que en un
  // pie con seis iconos de marca se leería como "chatear", no como WhatsApp.
  whatsapp: ({ size = 18, className }) => (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="currentColor" className={className} aria-hidden="true" focusable="false"
    >
      <path d="M12.04 2A9.9 9.9 0 0 0 2.15 11.9c0 1.75.46 3.45 1.33 4.95L2 22l5.3-1.38a9.86 9.86 0 0 0 4.74 1.2h.01a9.9 9.9 0 0 0 9.9-9.9A9.9 9.9 0 0 0 12.04 2zm0 18.02h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.1.81.83-3.02-.2-.31a8.2 8.2 0 1 1 6.96 3.85zm4.5-6.15c-.24-.12-1.45-.72-1.68-.8-.22-.08-.39-.12-.55.12-.16.25-.63.8-.77.97-.14.16-.28.18-.53.06-.24-.12-1.03-.38-1.97-1.22-.73-.65-1.22-1.45-1.36-1.7-.14-.24-.02-.37.1-.5.11-.1.25-.27.37-.41.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.3-.22.25-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.73 2.65 4.2 3.71.59.26 1.05.4 1.4.52.6.18 1.14.16 1.56.1.48-.07 1.45-.59 1.66-1.17.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28z" />
    </svg>
  ),
};

export function RedesSocialesPie({ className = "" }: { className?: string }) {
  const [redes, setRedes] = useState<RedesSociales>({});

  useEffect(() => {
    let vigente = true;
    fetchRedesSociales().then((r) => { if (vigente) setRedes(r); });
    return () => { vigente = false; };
  }, []);

  const configuradas = REDES.filter((r) => redes[r]);
  if (configuradas.length === 0) return null;

  return (
    <ul className={`flex items-center gap-2 ${className}`} aria-label="Redes sociales">
      {configuradas.map((red) => {
        const Icono = ICONO[red];
        return (
          <li key={red}>
            <a
              href={redes[red]}
              target="_blank"
              /* `noopener` no es opcional: sin él la página de destino recibe
                 `window.opener` y puede redirigir la nuestra desde otra pestaña. */
              rel="noopener noreferrer"
              aria-label={NOMBRE_RED[red]}
              title={NOMBRE_RED[red]}
              className="flex items-center justify-center w-9 h-9 border border-white/20 text-primary-foreground/70 hover:text-secondary hover:border-secondary transition-colors"
            >
              <Icono size={18} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
