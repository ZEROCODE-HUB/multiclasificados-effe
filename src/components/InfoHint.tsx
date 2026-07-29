import { useState } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Icono de ayuda ⓘ que muestra una explicación breve.
 *
 * Usa Popover y no Tooltip a propósito: el tooltip de Radix se abre al pasar el
 * ratón, pero NO al tocar, y buena parte de la publicación se hace desde el
 * móvil (IT3-018/019). Aquí se abre con clic o toque y, además, al pasar el
 * ratón en escritorio, así que se comporta como se espera en ambos sitios.
 */
export function InfoHint({
  label,
  children,
  className,
  size = 13,
}: {
  /** Nombre accesible del botón, p. ej. "Qué es un aviso destacado". */
  label: string;
  children: React.ReactNode;
  className?: string;
  size?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          // El contenedor suele ser una fila con contadores +/−: sin esto el
          // clic burbujearía y activaría el control de al lado.
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn(
            "inline-flex items-center justify-center text-muted-foreground hover:text-secondary transition-colors align-middle",
            className,
          )}
        >
          <Info size={size} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-64 text-xs leading-relaxed p-3"
        // Que no robe el foco al abrirse en escritorio: el usuario sigue
        // escribiendo en el formulario mientras lee.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
