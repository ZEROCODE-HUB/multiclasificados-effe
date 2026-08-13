import { createRoot } from "react-dom/client";
import { ListingLocationMap } from "@/components/ListingLocationMap";

// Mismo envoltorio que usa la ficha del aviso (ListingDetail), con contenido
// arriba y abajo para que la página tenga scroll de verdad.
createRoot(document.getElementById("root")!).render(
  <div style={{ width: 390 }}>
    <div style={{ height: 600 }} />
    <div className="relative h-56 md:h-80 bg-muted overflow-hidden border border-border">
      <ListingLocationMap lat={-12.0464} lng={-77.0428} price={185000} currency="USD" />
    </div>
    <div style={{ height: 600 }} />
  </div>,
);
