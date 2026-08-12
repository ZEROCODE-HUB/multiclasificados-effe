import { createRoot } from "react-dom/client";
import { ShareFab } from "@/components/ShareListing";
import { MOBILE_NAV, MOBILE_NAV_INNER } from "@/components/mobileNav.styles";

// El botón flotante de compartir junto a un doble de la barra inferior con SUS
// clases reales (importadas, no copiadas). Lo que hay que medir es que los dos
// no se pisen: montar la ficha entera exigiría stubear media app.
//
// El bloque alto de arriba da scroll a la página, que es la situación en la que
// el botón tiene sentido.
createRoot(document.getElementById("root")!).render(
  <>
    <div style={{ height: "200vh" }} />
    <ShareFab title="Camioneta 4x4 en buen estado" listingId="1" />
    <nav className={MOBILE_NAV} data-testid="barra-inferior">
      <div className={MOBILE_NAV_INNER} />
    </nav>
  </>,
);
