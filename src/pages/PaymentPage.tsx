import { useSearchParams } from "react-router-dom";
import { useState } from "react";
import { CheckCircle2, Wallet } from "lucide-react";
import { PaymentForm } from "@/components/PaymentForm";

// Página de pago propia que se abre en el navegador del SISTEMA desde el APK
// (redirect en móvil, para que el 3-D Secure corra en un navegador real y no
// dentro del WebView). Recibe el formToken y la clave pública por query; corre
// el mismo formulario embebido que la web. El webhook acredita el saldo y la app
// (que sigue haciendo polling) detecta el pago y cierra este navegador.
export default function PaymentPage() {
  const [params] = useSearchParams();
  const [paid, setPaid] = useState(false);

  const formToken = params.get("token") ?? "";
  const publicKey = params.get("pk") ?? "";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Wallet size={18} className="text-secondary" />
          <h1 className="font-bold">Pago seguro</h1>
        </div>

        {paid ? (
          <div className="rounded-md border border-success/40 bg-success/5 p-4 text-center space-y-2">
            <CheckCircle2 size={28} className="mx-auto text-success" />
            <p className="font-semibold text-success">¡Pago completado!</p>
            <p className="text-xs text-muted-foreground">
              Ya puedes volver a la app; tu saldo se acreditará en unos segundos.
            </p>
          </div>
        ) : !formToken ? (
          <p className="text-sm text-destructive">Falta la información del pago. Vuelve a intentarlo desde la app.</p>
        ) : (
          <PaymentForm formToken={formToken} publicKey={publicKey} onPaid={() => setPaid(true)} />
        )}
      </div>
    </div>
  );
}
