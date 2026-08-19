// Pantalla de pago por Yape o Plin: a dónde transferir y cómo avisarnos.
//
// Lo que el comprador tiene que entender aquí, sin leerse un párrafo:
//   1. cuánto paga y a qué número,
//   2. que hay que mandarnos el voucher por WhatsApp,
//   3. y que su saldo (o su aviso) sale solo en cuanto lo confirmemos, sin que
//      tenga que volver a esta pantalla.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2, Smartphone, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatSoles } from "@/lib/pricing";
import {
  NOMBRE_MEDIO, codigoDePago, confirmarPagoManual,
  type CuentaManual, type MedioManual,
} from "@/lib/pagoManual";

export interface PagoManualPanelProps {
  orderId: string;
  medio: MedioManual;
  monto: number;
  cuentas: CuentaManual[];
  whatsapp: string;
  mensaje: string;
  /** Nombre del comprador, para que el mensaje de WhatsApp lo lleve. */
  nombre?: string;
  /** true cuando el pago publica un aviso: cambia lo que se le promete. */
  publicaAviso?: boolean;
  onListo: () => void;
  onVolver?: () => void;
}

export function PagoManualPanel({
  orderId, medio, monto, cuentas, whatsapp, mensaje,
  nombre, publicaAviso, onListo, onVolver,
}: PagoManualPanelProps) {
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(texto);
      window.setTimeout(() => setCopiado((c) => (c === texto ? null : c)), 1800);
    } catch {
      // Sin portapapeles (contexto no seguro, WebView antiguo) el número sigue
      // en pantalla para teclearlo: no hace falta molestar con un error.
      toast({ title: "Copia el número a mano", description: texto });
    }
  };

  const confirmar = async () => {
    setEnviando(true);
    try {
      await confirmarPagoManual({ orderId, medio, monto, whatsapp, plantilla: mensaje, nombre });
      toast({
        title: "Avisado, gracias",
        description: publicaAviso
          ? "En cuanto confirmemos tu pago, tu aviso se publica solo."
          : "En cuanto confirmemos tu pago, el saldo entra en tu cuenta.",
      });
      onListo();
    } catch (e) {
      toast({
        title: "No se pudo registrar",
        description: e instanceof Error ? e.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border border-secondary/30 bg-secondary/5 px-4 py-3 flex justify-between items-baseline gap-3">
        <span className="font-bold uppercase tracking-wider text-xs text-muted-foreground">
          Paga con {NOMBRE_MEDIO[medio]}
        </span>
        <span className="text-3xl font-extrabold text-secondary tracking-tight">{formatSoles(monto)}</span>
      </div>

      <ol className="space-y-3">
        <li className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-secondary text-secondary-foreground text-xs font-bold grid place-items-center">1</span>
          <div className="flex-1 space-y-2">
            <p className="text-sm font-semibold leading-tight">
              Transfiere {formatSoles(monto)} desde tu app de {NOMBRE_MEDIO[medio]}
            </p>
            {cuentas.map((c) => (
              <div key={`${c.numero}-${c.titular}`} className="border p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono font-bold text-base tracking-wide">{c.numero}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.titular}{c.banco ? ` · ${c.banco}` : ""}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => copiar(c.numero)}>
                  {copiado === c.numero ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                  {copiado === c.numero ? "Copiado" : "Copiar"}
                </Button>
              </div>
            ))}
          </div>
        </li>

        <li className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-secondary text-secondary-foreground text-xs font-bold grid place-items-center">2</span>
          <div className="flex-1">
            <p className="text-sm font-semibold leading-tight">Mándanos el voucher por WhatsApp</p>
            <p className="text-xs text-muted-foreground mt-1">
              El botón de abajo abre el chat con el mensaje escrito. Solo adjunta la captura de tu pago.
            </p>
            {/* El código es lo que permite emparejar el voucher con la compra
                sin preguntarle nada al comprador. */}
            <p className="mt-2 text-xs">
              Código de tu pago:{" "}
              <span className="font-mono font-bold tracking-wider">{codigoDePago(orderId)}</span>
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-secondary text-secondary-foreground text-xs font-bold grid place-items-center">3</span>
          <div className="flex-1">
            <p className="text-sm font-semibold leading-tight">Listo, nosotros nos encargamos</p>
            <p className="text-xs text-muted-foreground mt-1">
              {publicaAviso
                ? "Revisamos tu pago y tu aviso se publica solo. Te avisamos cuando esté."
                : "Revisamos tu pago y el saldo entra en tu cuenta. Te avisamos cuando esté."}
            </p>
          </div>
        </li>
      </ol>

      <div className="flex items-center justify-between gap-3 pt-1 border-t">
        {onVolver ? (
          <Button variant="ghost" size="sm" onClick={onVolver} disabled={enviando} className="gap-1 -ml-2">
            <ArrowLeft size={14} /> Volver
          </Button>
        ) : <span />}
        <Button onClick={confirmar} disabled={enviando} className="gap-2">
          {enviando
            ? <><Loader2 size={14} className="animate-spin" /> Abriendo WhatsApp…</>
            : <><Smartphone size={14} /> Ya pagué, enviar voucher</>}
        </Button>
      </div>
    </div>
  );
}
