import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Upload } from "lucide-react";
import { categories } from "@/data/mockData";

const AdvertiserPublish = () => (
  <DashboardLayout role="anunciante">
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Publicar nuevo aviso</h1>
        <p className="text-muted-foreground">Completa los datos para crear tu aviso clasificado.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Información del aviso</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Categoría</Label>
            <Select>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Título del aviso</Label>
            <Input placeholder="Ej: Departamento 3 dormitorios en Miraflores" className="mt-1" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea placeholder="Describe tu producto o servicio en detalle..." className="mt-1 min-h-[120px]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Precio</Label>
              <Input type="number" placeholder="0.00" className="mt-1" />
            </div>
            <div>
              <Label>Moneda</Label>
              <Select>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Moneda" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PEN">PEN (S/.)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Ubicación</Label>
            <Input placeholder="Ej: Lima, Miraflores" className="mt-1" />
          </div>
          <div>
            <Label>Imágenes</Label>
            <div className="mt-1 border-2 border-dashed rounded-lg p-8 text-center hover:border-secondary/50 transition-colors cursor-pointer">
              <ImagePlus size={32} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Arrastra imágenes aquí o haz clic para seleccionar</p>
              <p className="text-xs text-muted-foreground mt-1">Máximo 10 imágenes, 5MB cada una</p>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="hero" size="lg" className="flex-1">Publicar aviso</Button>
            <Button variant="outline" size="lg">Guardar borrador</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>
);

export default AdvertiserPublish;
