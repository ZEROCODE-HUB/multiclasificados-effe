// Paginación reutilizable para tablas del panel.
// - usePagination: divide una lista en páginas y expone la página actual.
// - TablePagination: controles "Anterior / Siguiente" + "Página X de Y".
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function usePagination<T>(items: T[], pageSize = 10, resetKey?: unknown) {
  const [page, setPage] = useState(1);

  // Vuelve a la primera página cuando cambia el filtro/origen de datos.
  useEffect(() => { setPage(1); }, [resetKey]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  return { page: current, setPage, pageItems, totalPages, total, from, to };
}

interface TablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  setPage: (p: number) => void;
  /** Palabra para el conteo, p. ej. "comprobantes", "filas". */
  noun?: string;
}

export function TablePagination({ page, totalPages, total, from, to, setPage, noun = "registros" }: TablePaginationProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-2 border-t">
      <p className="text-xs text-muted-foreground">
        {total === 0 ? `Sin ${noun}` : `Mostrando ${from}–${to} de ${total} ${noun}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm" variant="outline" className="gap-1"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft size={14} /> Anterior
        </Button>
        <span className="text-xs text-muted-foreground px-2">Página {page} de {totalPages}</span>
        <Button
          size="sm" variant="outline" className="gap-1"
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Siguiente <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
