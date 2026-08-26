// "Solicitar saldo": el anunciante pide al equipo que le carguen saldo.
//
// Por qué no es solo un enlace `mailto:` y hay un diálogo de por medio: un
// `mailto:` falla EN SILENCIO. En un equipo sin cliente de correo configurado
// —que es lo normal en un Windows de oficina, y en un móvil sin la app de correo
// enlazada— pulsar el botón no hace nada visible, y la persona se queda creyendo
// que escribió. Este proyecto ya tropezó con eso y por eso el correo del chat
// dejó de abrir Gmail (ad52fbb) y el del pie de la portada es texto plano.
//
// Así que aquí se ofrecen las dos cosas a la vez: el botón que abre el correo
// para quien lo tenga configurado, y la dirección a la vista, copiable, para
// todos los demás. Nadie se queda sin poder escribir.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Mail, LifeBuoy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CORREO_SOPORTE, enlaceSolicitudDeSaldo } from "@/lib/soporte";

export interface SolicitarSaldoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nombre?: string | null;
  correo?: string | null;
  /** Saldo actual, para que el equipo no tenga que buscarlo. */
  saldo?: number | null;
}

export function SolicitarSaldoDialog({
  open, onOpenChange, nombre, correo, saldo,
}: SolicitarSaldoDialogProps) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(CORREO_SOPORTE);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sin portapapeles (contexto no seguro, WebView antiguo) la dirección
      // sigue en pantalla para teclearla: no hace falta molestar con un error.
      toast({ title: "Copia la dirección a mano", description: CORREO_SOPORTE });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy size={18} className="text-secondary" /> Solicitar saldo
          </DialogTitle>
          <DialogDescription>
            Escríbenos y te cargamos el saldo a mano. Es la vía para pagar por
            transferencia o con factura a nombre de tu empresa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="border p-3 space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Correo de soporte
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold break-all flex-1">{CORREO_SOPORTE}</span>
              <Button size="sm" variant="outline" onClick={copiar} className="gap-1.5 shrink-0">
                {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Cuéntanos en el correo:</p>
            <ul className="space-y-0.5 pl-4 list-disc">
              <li>Cuánto necesitas recargar.</li>
              <li>Cómo vas a pagar (transferencia, depósito…).</li>
              <li>Si necesitas factura, tu RUC y razón social.</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {/* Un enlace y no un botón: así el navegador decide cómo abrirlo, y
              quien tenga el correo configurado se ahorra copiar y pegar. */}
          <Button asChild className="gap-2">
            <a href={enlaceSolicitudDeSaldo({ nombre, correo, saldo })}>
              <Mail size={14} /> Escribir a soporte
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SolicitarSaldoDialog;
