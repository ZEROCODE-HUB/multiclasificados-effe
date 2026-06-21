import { useEffect, useState } from "react";
import { AdminLayout, AdminRole } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Save, Calculator, RotateCcw } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  PricingSettings,
  buildMatrix,
  loadSettings,
  saveSettings,
  formatSoles,
} from "@/lib/pricing";
import { toast } from "@/hooks/use-toast";

const AdminPricing = ({ role }: { role: AdminRole }) => {
  const [s, setS] = useState<PricingSettings>(() => loadSettings());
  const matrix = buildMatrix(s);

  useEffect(() => {
    const sync = () => setS(loadSettings());
    window.addEventListener("effe:pricing-updated", sync);
    return () => window.removeEventListener("effe:pricing-updated", sync);
  }, []);

  const save = () => {
    saveSettings(s);
    toast({ title: "Tarifas actualizadas", description: "La matriz se ha recalculado automáticamente." });
  };

  const reset = () => {
    setS(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    toast({ title: "Restablecido a valores por defecto" });
  };

  return (
    <AdminLayout role={role} title="Tarifas" breadcrumb={["Operación", "Tarifas"]}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Parámetros */}
        <Card className="lg:col-span-1">
          <CardHeader className="border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator size={16} className="text-secondary" /> Parámetros
            </CardTitle>
            <CardDescription className="text-xs">
              La matriz de precios se calcula automáticamente a partir de estos valores.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div>
              <Label>Precio base — 1 aviso × 7 días (S/.)</Label>
              <Input
                type="number"
                step="0.01"
                value={s.base}
                onChange={(e) => setS({ ...s, base: parseFloat(e.target.value) || 0 })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>% Descuento por aviso adicional (acumulativo)</Label>
              <Input
                type="number"
                step="0.01"
                value={(s.descPorAviso * 100).toFixed(2)}
                onChange={(e) => setS({ ...s, descPorAviso: (parseFloat(e.target.value) || 0) / 100 })}
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Se aplica del aviso 2 al 10.</p>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs uppercase tracking-wider font-bold text-secondary mb-2">
                Descuentos por rango de días
              </p>
              <p className="text-[11px] text-muted-foreground mb-3">
                En cada salto se duplica el precio del rango anterior y se aplica el % de descuento.
              </p>
              <div className="space-y-3">
                {([15, 30, 60, 90] as const).map((d) => (
                  <div key={d}>
                    <Label>
                      {d === 15 ? "7 → 15 días" : d === 30 ? "15 → 30 días" : d === 60 ? "30 → 60 días" : "60 → 90 días"} (%)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={(s.saltos[d] * 100).toFixed(2)}
                      onChange={(e) => setS({ ...s, saltos: { ...s.saltos, [d]: (parseFloat(e.target.value) || 0) / 100 } })}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs uppercase tracking-wider font-bold text-secondary mb-3">
                Extras (precio fijo, S/.)
              </p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["img100", "Imagen 100kb"],
                  ["img500", "Imagen 500kb"],
                  ["pdf100", "PDF 100kb"],
                  ["pdf500", "PDF 500kb"],
                  ["urgente", "Urgente"],
                  ["destacado", "Destacado"],
                  ["confidencial", "Confidencial"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={s.extras[key]}
                      onChange={(e) => setS({ ...s, extras: { ...s.extras, [key]: parseFloat(e.target.value) || 0 } })}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={save} className="flex-1 gap-2"><Save size={14} /> Guardar</Button>
              <Button variant="outline" onClick={reset} className="gap-2"><RotateCcw size={14} /> Restablecer</Button>
            </div>
          </CardContent>
        </Card>

        {/* Matriz */}
        <Card className="lg:col-span-2">
          <CardHeader className="border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Matriz de precios (S/. incluye IGV)</CardTitle>
              <CardDescription className="text-xs">Calculada automáticamente.</CardDescription>
            </div>
            <Badge variant="outline" className="text-secondary border-secondary/40">Automática</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto pt-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Avisos</TableHead>
                  <TableHead>7 días</TableHead>
                  <TableHead>15 días</TableHead>
                  <TableHead>30 días</TableHead>
                  <TableHead>60 días</TableHead>
                  <TableHead>90 días</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.map((row) => (
                  <TableRow key={row.n}>
                    <TableCell className="font-bold text-primary">{row.n}</TableCell>
                    <TableCell className="font-mono text-xs">{formatSoles(row.values[7])}</TableCell>
                    <TableCell className="font-mono text-xs">{formatSoles(row.values[15])}</TableCell>
                    <TableCell className="font-mono text-xs">{formatSoles(row.values[30])}</TableCell>
                    <TableCell className="font-mono text-xs">{formatSoles(row.values[60])}</TableCell>
                    <TableCell className="font-mono text-xs">{formatSoles(row.values[90])}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminPricing;
