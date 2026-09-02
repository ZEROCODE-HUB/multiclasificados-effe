// "Solicitar devolución de saldo": el anunciante pide que le devolvamos el
// dinero que tiene cargado y no va a gastar.
//
// Es el lado del usuario de una función que el equipo ya tenía: el
// administrador devuelve saldo desde Gestión de Usuarios, y el usuario no tenía
// forma de pedirlo desde donde ve su saldo.
//
// DÓNDE VIVE (actualizado el 2026-09-02):
//   · menú "Mi cuenta" de la barra superior — escritorio y móvil
//   · "Mi saldo", en el panel del anunciante
//
// Y dónde YA NO: dentro del cuadro de "Comprar saldo". Estaba ahí como un
// `mailto:` pelado, sin este diálogo detrás. O sea que había que abrir el flujo
// de COMPRAR para encontrar cómo pedir que te DEVUELVAN, y encima el enlace
// fallaba en silencio. Lo reportó el cliente y se retiró.
//
// Por qué hay un diálogo y no solo un enlace: un `mailto:` falla EN SILENCIO.
// En un equipo sin cliente de correo configurado —lo normal en un Windows de
// oficina, y en un móvil sin la app de correo enlazada— pulsar no hace nada
// visible, y la persona se queda creyendo que escribió. Este proyecto ya
// tropezó con eso, y por eso el correo del chat dejó de abrir Gmail (ad52fbb) y
// el del pie de la portada es texto plano. Aquí se ofrecen las dos cosas: el
// botón que abre el correo para quien lo tenga, y la dirección a la vista y
// copiable para todos los demás. Tratándose de dinero, que nadie se quede sin
// poder escribir importa más de lo normal.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Mail, Undo2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatCredits } from "@/lib/pricing";
import { CORREO_SOPORTE, cuerpoDevolucionSaldo, enlaceDevolucionSaldo } from "@/lib/soporte";

export interface DevolucionSaldoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nombre?: string | null;
  correo?: string | null;
  /** Saldo actual, para que el equipo no tenga que buscarlo. */
  saldo?: number | null;
}

export function DevolucionSaldoDialog({
  open, onOpenChange, nombre, correo, saldo,
}: DevolucionSaldoDialogProps) {
  const [copiado, setCopiado] = useState(false);
  const disponible = typeof saldo === "number" && Number.isFinite(saldo) ? saldo : 0;

  const alEscribir = () => {
    // Sin `await`: la navegación al `mailto:` va en el mismo gesto y no se
    // puede esperar. Si el portapapeles no está disponible, el aviso lo dice
    // igual y la dirección sigue a la vista arriba.
    void navigator.clipboard?.writeText(cuerpoDevolucionSaldo({ nombre, correo, saldo })).catch(() => undefined);
    toast({
      title: "Te copiamos el mensaje",
      description: `Si no se abrió tu correo, pégalo en uno nuevo a ${CORREO_SOPORTE}.`,
    });
  };

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
            <Undo2 size={18} className="text-secondary" /> Solicitar devolución de saldo
          </DialogTitle>
          <DialogDescription>
            Escríbenos y revisamos tu solicitud. La devolución no es automática:
            hay que verificar la cuenta antes de transferir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="border border-secondary/30 bg-secondary/5 px-3 py-2 flex justify-between items-baseline gap-3">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Saldo disponible
            </span>
            <span className="text-xl font-extrabold text-secondary tabular-nums">
              {formatCredits(disponible)}
            </span>
          </div>

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
            <p className="font-semibold text-foreground">Dinos en el correo:</p>
            <ul className="space-y-0.5 pl-4 list-disc">
              <li>Cuánto quieres que te devolvamos.</li>
              <li>El motivo.</li>
              <li>Tu banco y número de cuenta (CCI).</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {/* Un enlace y no un botón: así el navegador decide cómo abrirlo, y
              quien tenga el correo configurado se ahorra copiar y pegar.

              Y CON RED DEBAJO. Un `mailto:` que no encuentra cliente de correo
              no falla: no hace NADA. No hay evento, no hay error, no hay forma
              de detectarlo — la persona pulsa, no pasa nada y se queda creyendo
              que escribió. Tratándose de dinero eso es lo peor que puede pasar,
              y es justo lo que reportó el cliente.
              
              Así que al pulsar se copia además el correo entero al portapapeles
              y se dice. Si el cliente de correo abre, el mensaje ya está escrito
              y la copia sobra sin molestar; si no abre, la persona tiene el
              texto listo para pegarlo donde sea. Se copia DENTRO del gesto del
              clic porque el portapapeles solo lo permite ahí. */}
          <Button asChild className="gap-2">
            <a href={enlaceDevolucionSaldo({ nombre, correo, saldo })} onClick={alEscribir}>
              <Mail size={14} /> Escribir a soporte
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DevolucionSaldoDialog;
