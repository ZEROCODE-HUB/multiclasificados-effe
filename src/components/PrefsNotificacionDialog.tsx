// Preferencias de notificación de un usuario, desde el panel — punto B-02.
//
// EL CASO QUE RESUELVE, tal como lo contó el cliente: alguien llama diciendo que
// no le llegan los avisos, y resulta que él mismo apagó el canal hace meses.
// Hasta ahora administración solo podía explicarle por teléfono dónde pulsar.
//
// DOS COSAS QUE NO SON EVIDENTES
//
//  1. Lo que NO está en la tabla vale ACTIVADO. Así lo decidió la migración
//     0121, y `notify_user` funciona igual. Si aquí se asumiera "apagado" para
//     lo que falta, el panel enseñaría todo en gris a alguien que sí recibe sus
//     notificaciones — y quien lo mire creería haber encontrado el problema.
//  2. Se está tocando la configuración de otra persona sin que ella lo pida. Por
//     eso cada cambio queda en la auditoría con su valor anterior, y por eso el
//     cuadro lo dice en pantalla en vez de hacerlo callando.
import { useEffect, useState } from "react";
import { Bell, Loader2, Smartphone, Mail, MessageSquare } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { mensajeDeError } from "@/lib/errores";
import { NOTIF_EVENTS, DEFAULT_PREF } from "@/lib/notificationPrefs";
import { fetchPrefsDeUsuario, guardarPrefDeUsuario, type PrefCanales } from "@/lib/admin";

interface Props {
  userId: string | null;
  nombre: string;
  onClose: () => void;
  /** Sin permiso de edición el cuadro se ve, pero no se toca. */
  puedeEditar: boolean;
}

const CANALES: Array<{ k: keyof PrefCanales; label: string; icon: typeof Bell }> = [
  { k: "in_app", label: "Campana", icon: MessageSquare },
  { k: "push",   label: "Push",    icon: Smartphone },
  { k: "email",  label: "Correo",  icon: Mail },
];

export function PrefsNotificacionDialog({ userId, nombre, onClose, puedeEditar }: Props) {
  const [prefs, setPrefs] = useState<Record<string, PrefCanales>>({});
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setCargando(true);
    fetchPrefsDeUsuario(userId)
      .then(setPrefs)
      .catch((e) => toast({
        title: "No se pudieron cargar las preferencias",
        description: mensajeDeError(e, "Error"), variant: "destructive",
      }))
      .finally(() => setCargando(false));
  }, [userId]);

  // Lo que no está guardado son los tres canales activados (migración 0121).
  const de = (evento: string): PrefCanales => prefs[evento] ?? DEFAULT_PREF;

  const cambiar = async (evento: string, canal: keyof PrefCanales, valor: boolean) => {
    if (!userId) return;
    const nueva = { ...de(evento), [canal]: valor };
    // Optimista: el interruptor responde al instante y se revierte si falla.
    // Un switch que tarda medio segundo en moverse se pulsa dos veces.
    setPrefs((p) => ({ ...p, [evento]: nueva }));
    setGuardando(`${evento}:${canal}`);
    try {
      await guardarPrefDeUsuario(userId, evento, nueva);
    } catch (e) {
      setPrefs((p) => ({ ...p, [evento]: { ...nueva, [canal]: !valor } }));
      toast({ title: "No se pudo guardar", description: mensajeDeError(e, "Error"), variant: "destructive" });
    } finally {
      setGuardando(null);
    }
  };

  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell size={18} className="text-secondary" /> Notificaciones de {nombre}
          </DialogTitle>
          <DialogDescription>
            Puedes reactivar lo que el propio usuario haya desactivado. Cada cambio
            queda registrado en la auditoría a tu nombre.
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <p className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </p>
        ) : (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {/* Cabecera de canales: sin ella, tres interruptores seguidos no
                dicen cuál es cuál. */}
            <div className="hidden sm:grid grid-cols-[1fr_auto] gap-3 items-end pb-1 border-b">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Evento</span>
              <div className="flex gap-4">
                {CANALES.map((c) => (
                  <span key={c.k} className="w-12 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
                    {c.label}
                  </span>
                ))}
              </div>
            </div>

            {NOTIF_EVENTS.map((ev) => {
              const p = de(ev.event);
              return (
                <div key={ev.event} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 sm:gap-3 items-center border-b pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{ev.label}</p>
                    <p className="text-xs text-muted-foreground">{ev.desc}</p>
                  </div>
                  <div className="flex gap-4">
                    {CANALES.map((c) => (
                      <div key={c.k} className="w-12 flex flex-col items-center gap-1">
                        <span className="sm:hidden text-[10px] uppercase text-muted-foreground">{c.label}</span>
                        <Switch
                          checked={p[c.k]}
                          disabled={!puedeEditar || guardando === `${ev.event}:${c.k}`}
                          onCheckedChange={(v) => cambiar(ev.event, c.k, v)}
                          aria-label={`${c.label} · ${ev.label}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          {/* No hay "Guardar": cada interruptor guarda al pulsarlo. Un botón de
              guardar aquí invita a cerrar sin pulsarlo y perder los cambios. */}
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PrefsNotificacionDialog;
