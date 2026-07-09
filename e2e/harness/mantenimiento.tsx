import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { MaintenanceGate } from "@/components/MaintenanceGate";

// La ruta y la sesión se eligen desde el spec, antes de montar.
const w = window as unknown as { __ruta?: string };

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={[w.__ruta ?? "/"]}>
    <MaintenanceGate>
      <p>contenido de la plataforma</p>
    </MaintenanceGate>
  </MemoryRouter>,
);
