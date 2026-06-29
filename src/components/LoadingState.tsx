import { Loader2 } from "lucide-react";

// Estado de carga reutilizable (spinner + texto) para pantallas que traen datos.
export function LoadingState({
  label = "Cargando…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 text-muted-foreground ${className}`}>
      <Loader2 className="animate-spin mb-3 text-secondary" size={28} />
      <p className="text-sm">{label}</p>
    </div>
  );
}
