import { useState } from "react";
import { BookOpen, ShieldCheck, Send, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  submitComplaint,
  type ComplaintDocType,
  type ComplaintGoodType,
  type ComplaintInput,
  type ComplaintKind,
} from "@/lib/complaints";

const emptyForm: ComplaintInput = {
  kind: "reclamo",
  fullName: "",
  docType: "DNI",
  docNumber: "",
  email: "",
  phone: "",
  address: "",
  goodType: "servicio",
  amount: "",
  description: "",
  request: "",
};

export function LibroReclamaciones() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ComplaintInput>(emptyForm);
  const [sending, setSending] = useState(false);
  const [doneCode, setDoneCode] = useState<string | null>(null);

  const set = <K extends keyof ComplaintInput>(key: K, value: ComplaintInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const resetAll = () => {
    setForm(emptyForm);
    setDoneCode(null);
    setSending(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Limpia al cerrar para no dejar datos del reclamo anterior.
      setTimeout(resetAll, 200);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validación mínima de los campos obligatorios.
    if (!form.fullName.trim() || !form.docNumber.trim() || !form.email.trim()) {
      toast.error("Completa tu nombre, documento y correo.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Ingresa un correo electrónico válido.");
      return;
    }
    if (!form.description.trim() || !form.request.trim()) {
      toast.error("Describe el reclamo y tu pedido.");
      return;
    }

    setSending(true);
    const res = await submitComplaint(form);
    setSending(false);

    if (res.ok) {
      setDoneCode(res.code ?? "—");
      toast.success("Tu reclamo fue registrado y enviado correctamente.");
    } else {
      toast.error(res.error ?? "No se pudo enviar el reclamo. Inténtalo nuevamente.");
    }
  };

  return (
    <section className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 md:p-12">
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-secondary/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-8 md:gap-12">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-10 bg-secondary" />
                <span className="text-secondary uppercase tracking-[0.25em] font-bold text-[10px]">
                  Atención al consumidor
                </span>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 shrink-0 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center shadow-lg">
                  <BookOpen size={26} strokeWidth={1.8} />
                </div>
                <div>
                  <h2 className="text-2xl md:text-4xl font-extrabold text-foreground tracking-tight uppercase">
                    Libro de Reclamaciones
                  </h2>
                  <p className="text-muted-foreground text-sm md:text-base mt-3 max-w-xl leading-relaxed">
                    Conforme al Código de Protección y Defensa del Consumidor, ponemos a tu
                    disposición nuestro Libro de Reclamaciones virtual. Registra aquí tu reclamo o
                    queja y lo atenderemos a la brevedad.
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground mt-4">
                    <ShieldCheck size={14} className="text-secondary" />
                    Tu información se trata de forma confidencial.
                  </p>
                </div>
              </div>
            </div>

            <div className="shrink-0">
              <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogTrigger asChild>
                  <Button variant="hero" size="lg" className="gap-2 w-full md:w-auto">
                    <BookOpen size={18} /> Registrar reclamo
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  {doneCode ? (
                    // Confirmación tras el envío.
                    <div className="py-6 text-center">
                      <div className="mx-auto w-16 h-16 rounded-full bg-secondary/15 text-secondary flex items-center justify-center mb-5">
                        <CheckCircle2 size={34} />
                      </div>
                      <DialogTitle className="text-xl font-bold text-foreground">
                        Reclamo registrado
                      </DialogTitle>
                      <DialogDescription className="mt-3 text-sm">
                        Hemos recibido tu Hoja de Reclamación{" "}
                        <span className="font-semibold text-foreground">N.º {doneCode}</span> y la
                        enviamos a nuestro equipo. Te responderemos al correo que indicaste dentro
                        del plazo de ley.
                      </DialogDescription>
                      <Button
                        className="mt-6"
                        variant="hero"
                        onClick={() => handleOpenChange(false)}
                      >
                        Entendido
                      </Button>
                    </div>
                  ) : (
                    <>
                      <DialogHeader>
                        <DialogTitle className="text-xl font-bold uppercase tracking-tight">
                          Hoja de Reclamación
                        </DialogTitle>
                        <DialogDescription>
                          Completa los datos del reclamo. Los campos marcados con
                          <span className="text-destructive"> *</span> son obligatorios.
                        </DialogDescription>
                      </DialogHeader>

                      <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Tipo de solicitud */}
                        <div className="space-y-2">
                          <Label>Tipo de solicitud <span className="text-destructive">*</span></Label>
                          <RadioGroup
                            value={form.kind}
                            onValueChange={(v) => set("kind", v as ComplaintKind)}
                            className="flex gap-6"
                          >
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                              <RadioGroupItem value="reclamo" id="kind-reclamo" />
                              Reclamo (disconformidad con el bien/servicio)
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                              <RadioGroupItem value="queja" id="kind-queja" />
                              Queja (atención/proceso)
                            </label>
                          </RadioGroup>
                        </div>

                        {/* Datos del consumidor */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="rec-name">
                              Nombre completo <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="rec-name"
                              value={form.fullName}
                              onChange={(e) => set("fullName", e.target.value)}
                              placeholder="Nombres y apellidos"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Tipo de documento</Label>
                            <Select
                              value={form.docType}
                              onValueChange={(v) => set("docType", v as ComplaintDocType)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="DNI">DNI</SelectItem>
                                <SelectItem value="CE">Carné de extranjería</SelectItem>
                                <SelectItem value="Pasaporte">Pasaporte</SelectItem>
                                <SelectItem value="RUC">RUC</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="rec-doc">
                              N.º de documento <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="rec-doc"
                              value={form.docNumber}
                              onChange={(e) => set("docNumber", e.target.value)}
                              placeholder="Número"
                              inputMode="numeric"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="rec-email">
                              Correo electrónico <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="rec-email"
                              type="email"
                              value={form.email}
                              onChange={(e) => set("email", e.target.value)}
                              placeholder="tucorreo@ejemplo.com"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="rec-phone">Teléfono</Label>
                            <Input
                              id="rec-phone"
                              value={form.phone}
                              onChange={(e) => set("phone", e.target.value)}
                              placeholder="Celular o fijo"
                              inputMode="tel"
                            />
                          </div>

                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="rec-address">Domicilio</Label>
                            <Input
                              id="rec-address"
                              value={form.address}
                              onChange={(e) => set("address", e.target.value)}
                              placeholder="Dirección"
                            />
                          </div>
                        </div>

                        {/* Identificación del bien */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Tipo de bien contratado</Label>
                            <RadioGroup
                              value={form.goodType}
                              onValueChange={(v) => set("goodType", v as ComplaintGoodType)}
                              className="flex gap-6 pt-1"
                            >
                              <label className="flex items-center gap-2 cursor-pointer text-sm">
                                <RadioGroupItem value="producto" id="good-producto" />
                                Producto
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer text-sm">
                                <RadioGroupItem value="servicio" id="good-servicio" />
                                Servicio
                              </label>
                            </RadioGroup>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="rec-amount">Monto reclamado (opcional)</Label>
                            <Input
                              id="rec-amount"
                              value={form.amount}
                              onChange={(e) => set("amount", e.target.value)}
                              placeholder="S/ 0.00"
                            />
                          </div>
                        </div>

                        {/* Detalle */}
                        <div className="space-y-2">
                          <Label htmlFor="rec-desc">
                            Detalle del reclamo <span className="text-destructive">*</span>
                          </Label>
                          <Textarea
                            id="rec-desc"
                            value={form.description}
                            onChange={(e) => set("description", e.target.value)}
                            placeholder="Describe lo ocurrido con el mayor detalle posible."
                            rows={4}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="rec-request">
                            Pedido del consumidor <span className="text-destructive">*</span>
                          </Label>
                          <Textarea
                            id="rec-request"
                            value={form.request}
                            onChange={(e) => set("request", e.target.value)}
                            placeholder="¿Qué solución esperas?"
                            rows={3}
                          />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={sending}
                          >
                            Cancelar
                          </Button>
                          <Button type="submit" variant="hero" className="gap-2" disabled={sending}>
                            {sending ? (
                              <>
                                <Loader2 size={16} className="animate-spin" /> Enviando…
                              </>
                            ) : (
                              <>
                                <Send size={16} /> Enviar reclamo
                              </>
                            )}
                          </Button>
                        </div>
                      </form>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
