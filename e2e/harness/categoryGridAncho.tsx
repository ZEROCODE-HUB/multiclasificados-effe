import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { CategoryGrid } from "@/components/CategoryGrid";

// A diferencia de `categoryGrid.tsx`, que clava el ancho a 376 px para medir el
// recorte de los nombres en móvil, aquí la rejilla ocupa TODO el ancho de la
// ventana. Así la prueba puede cambiar el viewport y comprobar cuántas columnas
// salen en cada tamaño, que es justo lo que se ha tocado.
//
// El `px-4` imita el padding del contenedor de la portada.
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <div className="px-4">
      <CategoryGrid />
    </div>
  </MemoryRouter>,
);
