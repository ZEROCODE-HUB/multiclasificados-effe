// «Trabaje con nosotros» — punto B-18 de la auditoría.
//
// Pantalla con dirección propia (`/trabaje-con-nosotros`) y no un modal: una
// oferta de empleo se comparte por WhatsApp y se pega en un grupo, y un diálogo
// no se puede enlazar. Es la misma razón por la que los Términos salieron del
// modal en la v9.5.
//
// PÚBLICA DE VERDAD: no pide sesión. Exigir una cuenta para dejar un currículum
// pierde a la mitad de los candidatos en la puerta, y no ganamos nada: los datos
// que hacen falta están todos en el formulario.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  camposIncompletos, submitCareer, YaPostulaste, GRADOS,
  type CareerDocType, type CareerInput, type GradoInstruccion,
} from "@/lib/careers";
import { fechaHoraLarga } from "@/lib/fechas";

/** Todos los campos presentes; `grado` vacío hasta que se elija (ver `BorradorCareer`). */
type Borrador = Required<Omit<CareerInput, "grado" | "phone">> &
  { phone: string; grado: GradoInstruccion | "" };

const VACIO: Borrador = {
  apellidoPaterno: "", apellidoMaterno: "", nombres: "",
  docType: "DNI", docNumber: "", email: "", phone: "",
  grado: "", puesto: "", descripcion: "",
};

/** El id de cada campo, para poder llevar el foco al primero que falte. */
const ID: Record<keyof CareerInput, string> = {
  apellidoPaterno: "apellido-paterno",
  apellidoMaterno: "apellido-materno",
  nombres: "nombres",
  docType: "doc-type",
  docNumber: "doc-number",
  email: "email",
  phone: "phone",
  grado: "grado",
  puesto: "puesto",
  descripcion: "descripcion",
};

export default function TrabajeConNosotros() {
  const [form, setForm] = useState<Borrador>(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [faltan, setFaltan] = useState<(keyof CareerInput)[]>([]);
  const [hecho, setHecho] = useState<{ code: number | null; createdAt: string } | null>(null);
  const arriba = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = "Trabaje con nosotros · eFFe Multiclasificados"; }, []);

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Al escribir en un campo marcado, se le quita la marca en el acto: dejarla
    // hasta el siguiente envío hace pensar que sigue mal.
    setFaltan((f) => f.filter((x) => x !== k));
  };

  const marcado = (k: keyof CareerInput) =>
    faltan.includes(k) ? "border-destructive focus-visible:ring-destructive" : "";

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const incompletos = camposIncompletos(form);
    if (incompletos.length > 0) {
      setFaltan(incompletos);
      // El cursor va al PRIMER campo que falta, que es lo que se hizo al
      // publicar un aviso (punto 9 de los temas pendientes). Sin esto, en un
      // formulario largo el usuario ve el aviso rojo y no sabe dónde mirar.
      document.getElementById(ID[incompletos[0]])?.focus();
      toast.error("Falta completar algunos datos", {
        description: "Los campos marcados en rojo son obligatorios.",
      });
      return;
    }

    setEnviando(true);
    try {
      // Aquí `camposIncompletos` ya garantizó que el grado está elegido.
      const r = await submitCareer(form as CareerInput);
      setHecho(r);
      setForm(VACIO);
      arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      if (err instanceof YaPostulaste) {
        toast.error("Ya tenemos tu postulación", { description: err.message });
      } else {
        toast.error("No se pudo registrar tu postulación", {
          description: err instanceof Error ? err.message : "Inténtalo de nuevo en un momento.",
        });
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div ref={arriba} className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-6">
          <Link to="/"><ArrowLeft size={15} /> Volver al inicio</Link>
        </Button>

        {hecho ? (
          <div className="border border-border bg-card p-6 sm:p-8">
            <CheckCircle2 size={40} className="text-secondary mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Recibimos tu postulación</h1>
            <p className="text-muted-foreground">
              Quedó registrada
              {hecho.code != null && <> con el número <strong className="text-foreground">{hecho.code}</strong></>}
              {hecho.createdAt && <> el <strong className="text-foreground">{fechaHoraLarga(hecho.createdAt)}</strong></>}.
            </p>
            <p className="text-muted-foreground mt-3">
              La revisará el equipo de eFFe. Si tu perfil encaja con alguna posición nos
              pondremos en contacto por el correo que dejaste.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Button asChild><Link to="/">Ir al inicio</Link></Button>
              <Button variant="outline" onClick={() => setHecho(null)}>Enviar otra postulación</Button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-foreground mb-2">Trabaje con nosotros</h1>
            <p className="text-muted-foreground mb-8">
              Déjanos tus datos y cuéntanos a qué puesto postulas. Guardamos tu
              información para futuras convocatorias.
            </p>

            <form onSubmit={enviar} noValidate className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={ID.apellidoPaterno}>Apellido paterno *</Label>
                  <Input id={ID.apellidoPaterno} value={form.apellidoPaterno} className={marcado("apellidoPaterno")}
                    onChange={(e) => set("apellidoPaterno", e.target.value)} autoComplete="family-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={ID.apellidoMaterno}>Apellido materno *</Label>
                  <Input id={ID.apellidoMaterno} value={form.apellidoMaterno} className={marcado("apellidoMaterno")}
                    onChange={(e) => set("apellidoMaterno", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={ID.nombres}>Nombres *</Label>
                  <Input id={ID.nombres} value={form.nombres} className={marcado("nombres")}
                    onChange={(e) => set("nombres", e.target.value)} autoComplete="given-name" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={ID.docType}>Documento *</Label>
                  <Select value={form.docType} onValueChange={(v) => set("docType", v as CareerDocType)}>
                    <SelectTrigger id={ID.docType}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DNI">DNI</SelectItem>
                      <SelectItem value="CE">Carné de extranjería</SelectItem>
                      <SelectItem value="Pasaporte">Pasaporte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={ID.docNumber}>Número de documento *</Label>
                  <Input id={ID.docNumber} value={form.docNumber} className={marcado("docNumber")}
                    onChange={(e) => set("docNumber", e.target.value)} inputMode="numeric" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={ID.email}>Correo electrónico *</Label>
                  <Input id={ID.email} type="email" value={form.email} className={marcado("email")}
                    onChange={(e) => set("email", e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={ID.phone}>Teléfono</Label>
                  <Input id={ID.phone} value={form.phone ?? ""} inputMode="tel"
                    onChange={(e) => set("phone", e.target.value)} autoComplete="tel" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={ID.grado}>Grado de instrucción *</Label>
                  <Select value={form.grado} onValueChange={(v) => set("grado", v as GradoInstruccion)}>
                    <SelectTrigger id={ID.grado} className={marcado("grado")}>
                      <SelectValue placeholder="Selecciona" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADOS.map((g) => (
                        <SelectItem key={g.valor} value={g.valor}>{g.etiqueta}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={ID.puesto}>Puesto al que postulas *</Label>
                  <Input id={ID.puesto} value={form.puesto} className={marcado("puesto")}
                    placeholder="Ej.: Asesor comercial" onChange={(e) => set("puesto", e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={ID.descripcion}>Tus habilidades y tu experiencia *</Label>
                <Textarea id={ID.descripcion} rows={6} value={form.descripcion} className={marcado("descripcion")}
                  placeholder="Cuéntanos qué sabes hacer, dónde has trabajado y por qué te interesa el puesto."
                  onChange={(e) => set("descripcion", e.target.value)} />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={enviando} className="gap-2">
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {enviando ? "Enviando…" : "Enviar postulación"}
                </Button>
                <span className="text-xs text-muted-foreground">* Campos obligatorios</span>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
