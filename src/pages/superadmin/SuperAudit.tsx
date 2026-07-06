import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchAuditLogs, type AuditRow } from "@/lib/admin";

const PAGE_SIZE = 10;

const SuperAudit = () => {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchAuditLogs().then(({ data }) => setLogs(data));
  }, []);

  const filtered = useMemo(
    () =>
      logs.filter((l) =>
        q === "" ||
        [l.actor, l.action, l.entity].some((f) => (f ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [logs, q],
  );

  // Al cambiar el filtro, vuelve a la primera página.
  useEffect(() => { setPage(1); }, [q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const exportCsv = () => {
    const header = "Registro,Realizado por,Acción,Elemento afectado,Dirección IP,Fecha y hora";
    const rows = filtered.map((l) =>
      [l.id, l.actor, l.action, l.entity, l.ip, l.time].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "auditoria.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base md:text-lg">Historial de acciones importantes</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Aquí queda registrado quién hizo cada cambio importante en la plataforma y cuándo.
              </p>
            </div>
            <Button size="sm" variant="outline" className="gap-2" onClick={exportCsv}><Download size={14} /> Descargar historial</Button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por persona, acción o elemento afectado..." className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {/* Vista de tabla (escritorio) */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Realizado por</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Elemento afectado</TableHead>
                  <TableHead>Dirección IP</TableHead>
                  <TableHead>Fecha y hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No hay registros que coincidan con tu búsqueda.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.actor}</TableCell>
                      <TableCell><Badge variant="outline">{l.action}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{l.entity}</TableCell>
                      <TableCell className="font-mono text-xs">{l.ip}</TableCell>
                      <TableCell className="text-muted-foreground">{l.time}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Vista de tarjetas (móvil) */}
          <div className="md:hidden space-y-3">
            {pageRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No hay registros que coincidan con tu búsqueda.</p>
            ) : (
              pageRows.map((l) => (
                <div key={l.id} className="border rounded-xl p-4 bg-card">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-semibold text-sm">{l.actor}</p>
                    <Badge variant="outline">{l.action}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{l.entity}</p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2 pt-2 border-t">
                    <span className="font-mono">{l.ip}</span>
                    <span>{l.time}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Paginación */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-2 border-t">
            <p className="text-xs text-muted-foreground">
              {filtered.length === 0
                ? "Sin registros"
                : `Mostrando ${from}–${to} de ${filtered.length} registros`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="outline" className="gap-1"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft size={14} /> Anterior
              </Button>
              <span className="text-xs text-muted-foreground px-2">Página {currentPage} de {totalPages}</span>
              <Button
                size="sm" variant="outline" className="gap-1"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Siguiente <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default SuperAudit;
