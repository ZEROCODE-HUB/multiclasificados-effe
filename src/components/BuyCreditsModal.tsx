import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Wallet, ShieldCheck, User, Building2, Check, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  getCreditPackages, purchaseCredits,
  type CreditPackage, type PurchaseInvoiceData,
} from "@/lib/credits";

interface Props {
  open: boolean;
  onClose: () => void;
  creditCost: number;
  currentBalance: number;
  onPurchaseComplete: (newBalance: number) => void;
}

export function BuyCreditsModal({ open, onClose, creditCost, currentBalance, onPurchaseComplete }: Props) {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [selected, setSelected] = useState<CreditPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [buying, setBuying] = useState(false);

  // Datos de facturación
  const [personType, setPersonType] = useState<"natural" | "juridica">("natural");
  const [docNumber, setDocNumber] = useState("");
  const [email, setEmail] = useState("");
  const [receiptType, setReceiptType] = useState<"boleta" | "factura">("boleta");

  const deficit = Math.max(0, creditCost - currentBalance);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getCreditPackages()
      .then((pkgs) => {
        setPackages(pkgs);
        // Preseleccionar el paquete más pequeño que cubre el déficit
        const covering = pkgs.filter((p) => p.credits_amount >= deficit);
        if (covering.length > 0) setSelected(covering[0]);
        else if (pkgs.length > 0) setSelected(pkgs[pkgs.length - 1]);
      })
      .finally(() => setLoading(false));
  }, [open, deficit]);

  const handleBuy = async () => {
    if (!selected) return;
    if (!email.trim()) { toast({ title: "Ingresa tu correo", variant: "destructive" }); return; }
    if (!docNumber.trim()) { toast({ title: "Ingresa tu documento", variant: "destructive" }); return; }
    setBuying(true);
    try {
      const invoiceData: PurchaseInvoiceData = {
        receiptType,
        email: email.trim(),
        advertiserName: "",
        docType: personType === "natural" ? "dni" : "ruc",
        docNumber: docNumber.trim(),
      };
      const { newBalance, invoiceNumber } = await purchaseCredits(selected, invoiceData);
      toast({
        title: "¡Créditos acreditados!",
        description: `${selected.credits_amount} créditos añadidos. Comprobante: ${invoiceNumber}`,
      });
      onPurchaseComplete(newBalance);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al procesar la compra.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setBuying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet size={18} className="text-secondary" /> Comprar créditos
          </DialogTitle>
          <DialogDescription>
            Elige un paquete de créditos. Podrás usarlos en cualquier publicación.
          </DialogDescription>
        </DialogHeader>

        {/* Resumen de saldo */}
        <div className="grid grid-cols-3 gap-2 text-center text-sm border p-3 bg-muted/30">
          <div>
            <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Tu saldo</p>
            <p className="font-extrabold text-lg">{currentBalance.toFixed(0)} cr</p>
          </div>
          <div>
            <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Costo</p>
            <p className="font-extrabold text-lg text-primary">{creditCost.toFixed(2)} cr</p>
          </div>
          <div>
            <p className="text-muted-foreground text-[11px] uppercase tracking-wider">Déficit</p>
            <p className={`font-extrabold text-lg ${deficit > 0 ? "text-destructive" : "text-success"}`}>
              {deficit > 0 ? `-${deficit.toFixed(2)} cr` : "0 cr"}
            </p>
          </div>
        </div>

        {/* Paquetes */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
              Selecciona un paquete
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {packages.map((pkg) => {
                const covers = pkg.credits_amount >= deficit;
                const isSelected = selected?.id === pkg.id;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelected(pkg)}
                    className={`relative p-4 border text-left transition-all ${
                      isSelected
                        ? "border-secondary bg-secondary/10 ring-2 ring-secondary/30"
                        : "border-border hover:border-secondary/40 hover:bg-muted/50"
                    }`}
                  >
                    {covers && deficit > 0 && (
                      <Badge className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-success text-success-foreground">
                        Recomendado
                      </Badge>
                    )}
                    <p className="font-bold text-sm">{pkg.name}</p>
                    <p className="text-2xl font-extrabold text-secondary mt-1">
                      {pkg.credits_amount.toFixed(0)}
                      <span className="text-sm font-normal text-muted-foreground ml-1">créditos</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">S/ {pkg.price_soles.toFixed(2)}</p>
                    {isSelected && (
                      <Check size={14} className="absolute bottom-2 right-2 text-secondary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Datos de comprobante */}
        <div className="space-y-3 border-t pt-3">
          <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
            Datos del comprobante
          </Label>

          {/* Tipo de persona */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setPersonType("natural"); setReceiptType("boleta"); setDocNumber(""); }}
              className={`p-3 border text-left transition-all ${personType === "natural" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}
            >
              <User size={16} className="text-secondary mb-1" />
              <p className="font-bold text-xs">Persona natural</p>
              <p className="text-[10px] text-muted-foreground">Boleta · DNI</p>
            </button>
            <button
              type="button"
              onClick={() => { setPersonType("juridica"); setReceiptType("factura"); setDocNumber(""); }}
              className={`p-3 border text-left transition-all ${personType === "juridica" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}
            >
              <Building2 size={16} className="text-secondary mb-1" />
              <p className="font-bold text-xs">Empresa</p>
              <p className="text-[10px] text-muted-foreground">Factura · RUC</p>
            </button>
          </div>

          <div>
            <Label className="text-xs">{personType === "natural" ? "DNI (8 dígitos)" : "RUC (11 dígitos)"}</Label>
            <Input
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, ""))}
              maxLength={personType === "natural" ? 8 : 11}
              placeholder={personType === "natural" ? "12345678" : "20123456789"}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Correo para el comprobante</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={buying}>Cancelar</Button>
          <Button onClick={handleBuy} disabled={!selected || buying} className="gap-2">
            {buying ? (
              <><Loader2 size={14} className="animate-spin" /> Procesando…</>
            ) : (
              <><ShieldCheck size={14} /> Comprar {selected ? `${selected.credits_amount.toFixed(0)} cr — S/ ${selected.price_soles.toFixed(2)}` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
