import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Sparkles } from "lucide-react";
import { checkForUpdate, type UpdateDecision } from "@/lib/appVersion";

/** Abre la URL de descarga del APK (navegador del sistema en nativo). */
async function openDownload(url: string) {
  if (!url) return;
  if (Capacitor.isNativePlatform()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    } catch { /* cae al window.open */ }
  }
  window.open(url, "_blank", "noopener");
}

/**
 * Avisa cuando el APK instalado está desactualizado (verificador de versión
 * contra la BD, migración 0054). Solo actúa en la app nativa.
 *   - "forced":   el build está por debajo del mínimo → modal BLOQUEANTE.
 *   - "optional": hay una versión más nueva → modal cerrable ("Más tarde").
 *
 * No envuelve a la app: se monta como overlay. En web no hace nada.
 */
export function UpdateGate() {
  const [decision, setDecision] = useState<UpdateDecision | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let alive = true;
    checkForUpdate().then((d) => {
      if (alive && d && d.status !== "up-to-date") setDecision(d);
    });
    return () => { alive = false; };
  }, []);

  if (!decision || dismissed) return null;

  const forced = decision.status === "forced";
  const { info } = decision;

  return (
    <Dialog
      open
      // En forzado no se puede cerrar: ignoramos cualquier intento de cierre.
      onOpenChange={(open) => { if (!open && !forced) setDismissed(true); }}
    >
      <DialogContent
        className="sm:max-w-md"
        // En forzado, bloquear Esc y clic fuera para que no se pueda saltar.
        onEscapeKeyDown={(e) => forced && e.preventDefault()}
        onPointerDownOutside={(e) => forced && e.preventDefault()}
        onInteractOutside={(e) => forced && e.preventDefault()}
        hideClose={forced}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-secondary" />
            {forced ? "Actualización obligatoria" : "Hay una nueva versión"}
          </DialogTitle>
          <DialogDescription>
            {forced
              ? "Tu versión de la app ya no es compatible. Actualiza para seguir usándola."
              : `Ya está disponible ${info.version_name ? `la versión ${info.version_name}` : "una versión más reciente"}. Te recomendamos actualizar.`}
          </DialogDescription>
        </DialogHeader>

        {info.notes && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-line">
            {info.notes}
          </div>
        )}

        <DialogFooter className="gap-2">
          {!forced && (
            <Button variant="outline" onClick={() => setDismissed(true)}>
              Más tarde
            </Button>
          )}
          <Button variant="hero" className="gap-2" onClick={() => openDownload(info.download_url)}>
            <Download size={16} /> Actualizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
