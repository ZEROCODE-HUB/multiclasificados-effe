// Elegir país entre los 249 del mundo, sin que sea un muro.
//
// Con esa cantidad, un desplegable normal obliga a bajar cuatro pantallas hasta
// el país propio, así que este trae buscador. Y hay dos usos distintos:
//
//   • Publicando (o en el país de la boleta): la lista y ya. Da igual cuánta
//     gente publique en Italia si tu negocio está en Italia.
//   • Filtrando: además el número de avisos de cada país, porque ahí sí decide
//     dónde mirar. Los que no tienen ninguno se quedan, y lo dicen: saber que
//     en un país no hay nada es una respuesta, no un hueco.
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { PAISES, PAIS_POR_DEFECTO, nombrePais, type Pais } from "@/lib/paises";

/**
 * Para comparar en el buscador: sin tildes, sin mayúsculas y con el apóstrofo
 * tipográfico de "Côte d'Ivoire" convertido en uno normal. Así "peru" encuentra
 * "Perú" y "cote divoire" encuentra su país.
 */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .trim();
}

export interface SelectorDePaisProps {
  /** Código ISO, o "" cuando la elección es "todos los países". */
  value: string;
  onChange: (code: string) => void;
  /** Avisos por país. Solo lo pasa el filtro de búsqueda. */
  conteo?: Record<string, number>;
  /** Añade "Todos los países" arriba. Solo tiene sentido al filtrar. */
  incluirTodos?: boolean;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function SelectorDePais({
  value, onChange, conteo, incluirTodos, id, className, disabled, ...resto
}: SelectorDePaisProps) {
  const [abierto, setAbierto] = useState(false);

  // Perú SIEMPRE primero: es el país de la plataforma. Detrás, cuando hay
  // conteo, los que tienen avisos de más a menos —que es el orden en el que
  // alguien buscaría— y al final el resto, alfabético.
  const { destacados, resto: otros } = useMemo(() => {
    const peru = PAISES.find((p) => p.code === PAIS_POR_DEFECTO)!;
    const demas = PAISES.filter((p) => p.code !== PAIS_POR_DEFECTO);
    if (!conteo) return { destacados: [peru], resto: demas };

    const conAvisos = demas
      .filter((p) => (conteo[p.code] ?? 0) > 0)
      .sort((a, b) => (conteo[b.code] ?? 0) - (conteo[a.code] ?? 0));
    const vacios = demas.filter((p) => (conteo[p.code] ?? 0) === 0);
    return { destacados: [peru, ...conAvisos], resto: vacios };
  }, [conteo]);

  const elegido = value ? nombrePais(value) : "Todos los países";

  const etiquetaConteo = (p: Pais) => {
    if (!conteo) return null;
    const n = conteo[p.code] ?? 0;
    return (
      <span className={cn("ml-auto pl-3 text-xs tabular-nums shrink-0",
        n > 0 ? "text-muted-foreground" : "text-muted-foreground/60")}>
        {n === 1 ? "1 aviso" : `${n} avisos`}
      </span>
    );
  };

  const opcion = (p: Pais) => (
    <CommandItem
      key={p.code}
      // El código entra en el valor para que buscar "PE" también funcione.
      value={`${p.nombre} ${p.code}`}
      onSelect={() => { onChange(p.code); setAbierto(false); }}
    >
      <Check className={cn("mr-2 h-4 w-4 shrink-0", value === p.code ? "opacity-100" : "opacity-0")} />
      <span className="truncate">{p.nombre}</span>
      {etiquetaConteo(p)}
    </CommandItem>
  );

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
          {...resto}
        >
          <span className="truncate">{elegido}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0" align="start">
        <Command
          filter={(valor, busqueda) => (normalizar(valor).includes(normalizar(busqueda)) ? 1 : 0)}
        >
          {/* 16px en móvil: por debajo de eso iOS hace zoom solo al enfocar el
              campo y descuadra la pantalla entera. */}
          <CommandInput placeholder="Busca un país…" className="text-base md:text-sm" />
          <CommandList className="max-h-72">
            <CommandEmpty>Ningún país con ese nombre.</CommandEmpty>

            {incluirTodos && (
              <CommandGroup>
                <CommandItem
                  value="Todos los países"
                  onSelect={() => { onChange(""); setAbierto(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value ? "opacity-0" : "opacity-100")} />
                  <Globe className="mr-2 h-4 w-4 shrink-0 opacity-60" />
                  Todos los países
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup>{destacados.map(opcion)}</CommandGroup>
            {otros.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={conteo ? "Sin avisos por ahora" : undefined}>
                  {otros.map(opcion)}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
