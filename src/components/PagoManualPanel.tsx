// Pantalla de pago por Yape o Plin: a dónde transferir y cómo avisarnos.
//
// Lo que el comprador tiene que entender aquí, sin leerse un párrafo:
//   1. cuánto paga y a qué número,
//   2. que hay que mandarnos el voucher por WhatsApp,
//   3. y que su saldo (o su aviso) sale solo en cuanto lo confirmemos, sin que
//      tenga que volver a esta pantalla.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2, Smartphone, ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatSoles } from "@/lib/pricing";
import {
  NOMBRE_MEDIO, codigoDePago, confirmarPagoManual, abrirVoucherEnWhatsApp, enlaceDelVoucher,
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
  /** true si el aviso ya está fuera y lo que compra son días más. */
  esRenovacion?: boolean;
  onListo: () => void;
  onVolver?: () => void;
}

export function PagoManualPanel({
  orderId, medio, monto, cuentas, whatsapp, mensaje,
  nombre, publicaAviso, esRenovacion, onListo, onVolver,
}: PagoManualPanelProps) {
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  // El navegador bloqueó la pestaña de WhatsApp: hay que darle el enlace.
  const [bloqueado, setBloqueado] = useState(false);
  // Ya nos avisó de este pago. Reportado por el cliente: con la pestaña de
  // WhatsApp bloqueada esta pantalla se quedaba viva con el botón otra vez
  // activo, así que un segundo clic mandaba un segundo mensaje por el MISMO
  // pago — y al equipo le llegaban dos vouchers de una sola transferencia.
  const [avisado, setAvisado] = useState(false);

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

  const datosVoucher = { orderId, medio, monto, whatsapp, plantilla: mensaje, nombre };

  // Con QR el primer paso deja de ser "teclea este número", que es de donde
  // salen los pagos a la cuenta equivocada.
  const hayQr = cuentas.some((c) => !!c.qr);

  const confirmar = async () => {
    if (avisado || enviando) return;
    // WhatsApp se abre PRIMERO y en otra pestaña, dentro del propio clic: esta
    // pantalla tiene que seguir viva para llevar al usuario a sus avisos. Antes
    // se abría encima y, al volver con "atrás", seguía en el formulario de
    // publicar como si no hubiera pasado nada.
    const abierto = abrirVoucherEnWhatsApp(datosVoucher);
    if (!abierto) setBloqueado(true);

    setEnviando(true);
    setAvisado(true);
    try {
      await confirmarPagoManual({ orderId });
    } catch {
      // El pago está en la bandeja igualmente: la orden existe desde que eligió
      // Yape. Solo se pierde la marca de "ya avisó", así que no se le corta el
      // paso por esto.
    }
    setEnviando(false);

    // Con la pestaña bloqueada, el usuario todavía tiene que mandar el voucher:
    // se queda aquí con el enlace a mano en vez de irse sin haberlo enviado.
    if (!abierto) return;

    toast({
      title: "Avisado, gracias",
      description: esRenovacion
        ? "En cuanto confirmemos tu pago, tu aviso suma sus días nuevos."
        : publicaAviso
          ? "En cuanto confirmemos tu pago, tu aviso se publica solo."
          : "En cuanto confirmemos tu pago, el saldo entra en tu cuenta.",
    });
    onListo();
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
              {hayQr
                ? `Escanea el QR con tu app y transfiere ${formatSoles(monto)}`
                : `Transfiere ${formatSoles(monto)} desde tu app de ${NOMBRE_MEDIO[medio]}`}
            </p>
            {cuentas.map((c, i) => (
              <div key={`${c.numero}-${c.qr}-${i}`} className="border p-3 space-y-3">
                {c.qr && (
                  <div className="flex flex-col items-center gap-1.5">
                    {/* Fondo blanco siempre: un QR con transparencia sobre el
                        tema oscuro no lo lee ninguna cámara. */}
                    {/* Sin loading="lazy" a propósito, y esto se comprobó en
                        producción: dentro del diálogo la imagen se quedaba sin
                        cargar aunque estuviera a la vista, y el comprador veía
                        un hueco donde va el QR. Son 26 KB y es lo principal de
                        esta pantalla: no hay nada que diferir. */}
                    <img
                      src={c.qr}
                      alt={`Código QR para pagar con ${NOMBRE_MEDIO[medio]}`}
                      className="w-44 h-44 object-contain border bg-white p-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      {c.titular ? `A nombre de ${c.titular}` : "Escanéalo desde tu app"}
                    </p>
                  </div>
                )}
                {c.numero && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {c.qr && (
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          O paga a este número
                        </p>
                      )}
                      <p className="font-mono font-bold text-base tracking-wide">{c.numero}</p>
                      {!c.qr && (
                        <p className="text-xs text-muted-foreground truncate">
                          {c.titular}{c.banco ? ` · ${c.banco}` : ""}
                        </p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => copiar(c.numero)}>
                      {copiado === c.numero ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                      {copiado === c.numero ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                )}
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
              {esRenovacion
                ? "Revisamos tu pago y tu aviso suma sus días. Te avisamos cuando esté."
                : publicaAviso
                  ? "Revisamos tu pago y tu aviso se publica solo. Te avisamos cuando esté."
                  : "Revisamos tu pago y el saldo entra en tu cuenta. Te avisamos cuando esté."}
            </p>
          </div>
        </li>
      </ol>

      {bloqueado && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900
                      dark:bg-amber-950/40 dark:text-amber-200">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>
            Tu navegador bloqueó la ventana de WhatsApp.{" "}
            <a
              href={enlaceDelVoucher(datosVoucher)}
              target="_blank" rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2"
            >
              Ábrelo desde aquí
            </a>{" "}
            para mandarnos tu voucher.
          </span>
        </p>
      )}

      {/* Una vez avisado, "Volver" deja de tener sentido: llevaba de vuelta al
          formulario de publicar, que es justo donde el usuario podía creer que
          no había pasado nada y pagar otra vez. Se cambia por la salida buena. */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t">
        {onVolver && !avisado ? (
          <Button variant="ghost" size="sm" onClick={onVolver} disabled={enviando} className="gap-1 -ml-2">
            <ArrowLeft size={14} /> Volver
          </Button>
        ) : <span />}
        {avisado ? (
          <Button onClick={onListo} disabled={enviando} className="gap-2">
            {enviando
              ? <><Loader2 size={14} className="animate-spin" /> Un momento…</>
              : <><Check size={14} /> {publicaAviso ? "Ver mis avisos" : "Ver mi saldo"}</>}
          </Button>
        ) : (
          <Button onClick={confirmar} disabled={enviando} className="gap-2">
            {enviando
              ? <><Loader2 size={14} className="animate-spin" /> Abriendo WhatsApp…</>
              : <><Smartphone size={14} /> Ya pagué, enviar voucher</>}
          </Button>
        )}
      </div>
    </div>
  );
}
