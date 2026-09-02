// «Acerca de Nosotros» con dirección propia (`/acerca-de`).
//
// Con página además del bloque de la portada, y por el mismo motivo que
// «Trabaje con nosotros» (B-18) y los Términos: esto se enlaza. Se pega en un
// correo, en una ficha de proveedor o en un formulario que pide "web de la
// empresa", y un ancla a mitad de la portada no sirve para eso — el enlace
// "Acerca de" que se retiró en la iteración 3 era exactamente eso y por eso se
// retiró.
//
// PÚBLICA DEL TODO: no pide sesión. El texto lo edita el administrador desde
// Comercial → Variables del sistema (migración 0141).
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AcercaDeNosotros } from "@/components/AcercaDeNosotros";

const AcercaDe = () => (
  <main className="min-h-screen bg-background">
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-6">
        <Link to="/"><ArrowLeft size={15} /> Volver al inicio</Link>
      </Button>

      {/* `comoH1`: en la portada el título es un h2 porque cuelga del h1 de la
          página; aquí es el encabezado principal, y saltarse el h1 deja la
          página sin título para un lector de pantalla y para Google. */}
      <AcercaDeNosotros comoH1 className="px-0" />

      <div className="mt-12 border-t border-border pt-8 text-center">
        <p className="text-sm text-muted-foreground">
          ¿Quieres escribirnos? <span className="font-semibold text-foreground">info@coleffe.com</span>
        </p>
        {/* Va como texto y NO como `mailto:`, igual que en el pie de la portada:
            en un equipo sin cliente de correo configurado, pulsarlo abre una
            ventana en blanco y el usuario cree que escribió.

            Los iconos de redes NO se repiten aquí: `RedesSocialesPie` está
            pintado para el pie oscuro (`text-primary-foreground`, borde blanco)
            y sobre este fondo claro serían seis cuadrados invisibles. Están en
            el pie de la portada, que es su sitio. */}
        <div className="mt-8">
          <Button asChild><Link to="/buscar">Ver los avisos</Link></Button>
        </div>
      </div>
    </div>
  </main>
);

export default AcercaDe;
