import { createRoot } from "react-dom/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Un modal MÁS ALTO que la pantalla: es el caso que fallaba (los cortos caben de
// sobra y nunca llegaban a invadir el notch). Mismo patrón que "Reportar
// usuario", que es donde se detectó.
function ModalLargo() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reportar usuario</DialogTitle>
          <DialogDescription>Cuéntanos qué problema observas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {Array.from({ length: 25 }, (_, i) => (
            <p key={i} className="text-sm">
              Motivo de ejemplo número {i + 1} para que el contenido no quepa en la pantalla.
            </p>
          ))}
        </div>
        <Button>Enviar reporte</Button>
      </DialogContent>
    </Dialog>
  );
}

createRoot(document.getElementById("root")!).render(<ModalLargo />);
