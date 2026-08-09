import { useState } from "react";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { buscarZonas, etiquetaZona, type Zona } from "@/lib/zonas";

interface ZonaPickerProps {
  value: Zona | null;
  onChange: (zona: Zona) => void;
  /** Texto del botón cuando no hay nada elegido. */
  placeholder?: string;
  className?: string;
  id?: string;
}

/**
 * Elegir una zona del Perú (provincia, o distrito en Lima y Callao) escribiendo.
 *
 * Una lista única con buscador, y no menús en cascada de departamento →
 * provincia → distrito: para encontrar Miraflores basta teclear "mira", sin
 * saberse antes que está en el departamento de Lima. Son 244 zonas, así que se
 * muestran las 50 primeras coincidencias y se afina escribiendo.
 */
export function ZonaPicker({ value, onChange, placeholder = "Elige tu zona", className, id }: ZonaPickerProps) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const resultados = buscarZonas(consulta);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          className={cn("w-full justify-between gap-2 font-normal", className)}
        >
          <span className={cn("flex min-w-0 items-center gap-2", !value && "text-muted-foreground")}>
            <MapPin size={14} className="shrink-0 text-secondary" />
            <span className="truncate">{value ? etiquetaZona(value) : placeholder}</span>
          </span>
          <ChevronsUpDown size={14} className="shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* El filtrado es nuestro (sin tildes y priorizando lo que empieza por
            el texto), así que se apaga el de cmdk. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Busca tu distrito o provincia…" value={consulta} onValueChange={setConsulta} />
          <CommandList>
            <CommandEmpty>No encontramos esa zona.</CommandEmpty>
            {resultados.map((zona) => (
              <CommandItem
                key={zona.id}
                value={zona.id}
                onSelect={() => {
                  onChange(zona);
                  setAbierto(false);
                  setConsulta("");
                }}
              >
                <Check size={14} className={cn("mr-2", value?.id === zona.id ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{etiquetaZona(zona)}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
