import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { CategoryGrid } from "@/components/CategoryGrid";

// Ancho de un móvil (dos columnas), que es donde los nombres largos se salían
// de la tarjeta.
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <div style={{ width: 376 }}>
      <CategoryGrid />
    </div>
  </MemoryRouter>,
);
