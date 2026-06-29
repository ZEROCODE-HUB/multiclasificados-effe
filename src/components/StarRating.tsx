import { Star } from "lucide-react";

// Estrellas de solo lectura.
export function StarRating({ value, size = 16 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= rounded ? "text-secondary fill-secondary" : "text-muted-foreground/30"}
        />
      ))}
    </div>
  );
}

// Estrellas interactivas (para el formulario de reseña).
export function StarInput({
  value,
  onChange,
  size = 28,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="transition-transform hover:scale-110 outline-none"
          aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
        >
          <Star
            size={size}
            className={n <= value ? "text-secondary fill-secondary" : "text-muted-foreground/30 hover:text-secondary/50"}
          />
        </button>
      ))}
    </div>
  );
}
