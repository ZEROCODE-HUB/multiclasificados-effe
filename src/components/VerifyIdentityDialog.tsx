// Cuadro de verificación de identidad: consulta el DNI/RUC contra RENIEC/SUNAT
// (vía la Edge Function `verify-doc` → Factiliza), muestra la ficha real y exige
// que el usuario CONFIRME que esos datos son suyos.
//
// Vive en un componente propio porque lo usan dos flujos —publicar desde el
// formulario y publicar un borrador guardado— y duplicar un control de identidad
// es exactamente cómo las dos copias se desincronizan.
//
// Consultar el documento NO equivale a aceptarlo: el diálogo solo llama a
// `onConfirmed` cuando hay ficha y el usuario pulsa "Confirmar y continuar".
import { useEffect, useState } from "react";
import { ShieldCheck, Building2, User, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { verifyDocument } from "@/lib/verifyDoc";

export type PersonType = "natural" | "juridica" | "";

export interface ConfirmedIdentity {
  docType: "dni" | "ruc";
  docNumber: string;
  name: string;
  personType: Exclude<PersonType, "">;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La Edge Function exige sesión: sin ella ni se consulta. */
  enabled?: boolean;
  defaultPersonType?: PersonType;
  defaultDocNumber?: string;
  onConfirmed: (identity: ConfirmedIdentity) => void;
}

export function VerifyIdentityDialog({
  open, onOpenChange, enabled = true, defaultPersonType = "", defaultDocNumber = "", onConfirmed,
}: Props) {
  const [personType, setPersonType] = useState<PersonType>(defaultPersonType);
  const [docNumber, setDocNumber] = useState(defaultDocNumber);
  const [verifying, setVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState("");
  const [docData, setDocData] = useState<Record<string, unknown> | null>(null);
  const [docError, setDocError] = useState("");

  // Consulta automática en cuanto el documento tiene la longitud exacta
  // (DNI 8 / RUC 11). Antes era un botón "Verificar" que, al acertar, publicaba
  // de inmediato: el usuario nunca llegaba a ver el nombre que devolvía RENIEC.
  useEffect(() => {
    if (!open) return;
    const requiredLen = personType === "natural" ? 8 : 11;
    setDocError("");
    if (!personType || docNumber.length !== requiredLen) {
      setVerifiedName("");
      setDocData(null);
      setVerifying(false);
      return;
    }
    if (!enabled) return;

    const tipo = personType === "natural" ? "dni" : "ruc";
    let cancelled = false;
    setVerifying(true);
    setVerifiedName("");
    setDocData(null);
    verifyDocument(tipo, docNumber)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setVerifiedName(r.nombre ?? "");
          setDocData(r.data ?? null);
        } else {
          setDocError(r.error ?? "No se pudo verificar el documento. Revisa el número.");
        }
      })
      .catch(() => { if (!cancelled) setDocError("No se pudo verificar el documento."); })
      .finally(() => { if (!cancelled) setVerifying(false); });
    return () => { cancelled = true; };
    // `enabled` es un booleano, no el objeto de sesión: depender del objeto
    // re-dispararía el efecto en cada render y gastaría una consulta cada vez.
  }, [open, personType, docNumber, enabled]);

  // Campo de la ficha de Factiliza; "" si no viene o llega vacío.
  const docField = (k: string): string => {
    const v = docData?.[k];
    return typeof v === "string" && v.trim() ? v.trim() : "";
  };
  const ubigeo = [docField("distrito"), docField("provincia"), docField("departamento")]
    .filter(Boolean).join(" - ");
  const direccion = docField("direccion_completa")
    || [docField("direccion"), ubigeo].filter(Boolean).join(", ");
  const docRows: Array<[string, string]> = personType === "juridica"
    ? [
        ["RUC", docNumber],
        ["Estado", docField("estado")],
        ["Condición", docField("condicion")],
        ["Domicilio fiscal", direccion],
      ]
    : [
        ["DNI", docNumber],
        ["Domicilio", direccion],
      ];

  // Cambiar el documento (o el tipo de persona) invalida la ficha anterior: si
  // no, se confirmaba un DNI y se publicaba con otro.
  const resetIdentity = () => {
    setVerifiedName("");
    setDocData(null);
    setDocError("");
  };

  const confirm = () => {
    if (!verifiedName || !personType) return;
    onConfirmed({
      docType: personType === "natural" ? "dni" : "ruc",
      docNumber,
      name: verifiedName,
      personType,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verifica tu identidad</DialogTitle>
          <DialogDescription>
            Antes de publicar, indícanos si publicas como persona natural o jurídica.
            Validaremos tu documento y deberás confirmar los datos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setPersonType("natural"); setDocNumber(""); resetIdentity(); }}
              className={`p-4 border text-left transition-all ${personType === "natural" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}
            >
              <User size={20} className="text-secondary mb-2" />
              <p className="font-bold text-sm">Persona natural</p>
              <p className="text-[11px] text-muted-foreground">DNI · 8 dígitos</p>
            </button>
            <button
              type="button"
              onClick={() => { setPersonType("juridica"); setDocNumber(""); resetIdentity(); }}
              className={`p-4 border text-left transition-all ${personType === "juridica" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}
            >
              <Building2 size={20} className="text-secondary mb-2" />
              <p className="font-bold text-sm">Persona jurídica</p>
              <p className="text-[11px] text-muted-foreground">RUC · 11 dígitos</p>
            </button>
          </div>
          {personType && (
            <div>
              <Label>{personType === "natural" ? "DNI" : "RUC"}</Label>
              <Input
                value={docNumber}
                onChange={(e) => { setDocNumber(e.target.value.replace(/\D/g, "")); resetIdentity(); }}
                maxLength={personType === "natural" ? 8 : 11}
                placeholder={personType === "natural" ? "12345678" : "20123456789"}
                inputMode="numeric"
                className="mt-1"
                disabled={verifying}
              />

              {verifying && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 size={13} className="animate-spin" /> Verificando en Factiliza…
                </p>
              )}

              {/* Ficha real devuelta por RENIEC/SUNAT: es lo que el usuario confirma. */}
              {!verifying && verifiedName && (
                <div className="mt-2 rounded-md border border-success/40 bg-success/5 p-2.5 text-xs space-y-1.5">
                  <p className="flex items-center gap-1.5 font-semibold text-success">
                    <CheckCircle2 size={14} /> {personType === "natural" ? "Identidad encontrada" : "Empresa encontrada"}
                  </p>
                  <p className="font-medium text-foreground leading-snug">{verifiedName}</p>
                  <dl className="space-y-0.5">
                    {docRows.filter(([, v]) => v).map(([label, value]) => (
                      <div key={label} className="flex gap-2">
                        <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                        <dd className="text-foreground break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="pt-1 text-muted-foreground">¿Estos datos son tuyos? Confírmalos para continuar.</p>
                </div>
              )}

              {!verifying && docError && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" /> {docError}
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirm} disabled={verifying || !verifiedName} className="gap-2">
            <ShieldCheck size={14} /> Confirmar y continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
