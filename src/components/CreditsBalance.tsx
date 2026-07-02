import { useEffect, useState } from "react";
import { Wallet, Plus } from "lucide-react";
import { getCreditBalance, getCreditsSpent } from "@/lib/credits";
import { BuyCreditsModal } from "@/components/BuyCreditsModal";
import { useSession } from "@/hooks/useSession";
import { avisosForBalance } from "@/lib/pricing";

// Chip de saldo de créditos para la barra superior. Visible para CUALQUIER
// usuario con sesión (anunciante, buscador, admin…), no solo el anunciante.
// Al pulsarlo abre el modal de compra. Variante compacta por defecto y una
// versión "full" (fila) para el menú móvil.
export function CreditsBalance({ variant = "chip" }: { variant?: "chip" | "row" }) {
  const session = useSession();
  const [balance, setBalance] = useState<number | null>(null);
  const [, setSpent] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!session) { setBalance(null); return; }
    getCreditBalance().then(setBalance).catch(() => setBalance(null));
    getCreditsSpent().then(setSpent).catch(() => setSpent(0));
  }, [session]);

  if (!session) return null;

  const label = balance === null ? "…" : `${balance.toFixed(2)} cr`;
  const avisos = balance === null ? null : avisosForBalance(balance);
  const avisosLabel = avisos === null ? "" : `≈ ${avisos} aviso${avisos === 1 ? "" : "s"}`;

  return (
    <>
      {variant === "row" ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium hover:bg-muted/50 w-full"
        >
          <span className="flex items-center gap-3">
            <Wallet size={16} className="text-secondary" />
            <span className="flex flex-col items-start leading-tight">
              Mis créditos
              {avisos !== null && <span className="text-[11px] text-muted-foreground font-normal">{avisosLabel} disponibles</span>}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-secondary font-bold">
            {label} <Plus size={13} className="text-muted-foreground" />
          </span>
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          title={avisos === null ? "Mis créditos · Comprar" : `Mis créditos · ${avisosLabel} · Comprar`}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border hover:border-secondary/50 hover:bg-muted/50 transition-all rounded-none"
        >
          <Wallet size={16} className="text-secondary" />
          <span className="text-xs font-semibold text-foreground">{label}</span>
          <Plus size={13} className="text-muted-foreground" />
        </button>
      )}

      <BuyCreditsModal
        open={open}
        onClose={() => setOpen(false)}
        creditCost={0}
        currentBalance={balance ?? 0}
        onPurchaseComplete={(newBalance) => {
          setBalance(newBalance);
          getCreditsSpent().then(setSpent).catch(() => {});
          setOpen(false);
        }}
      />
    </>
  );
}
