import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ListingCard } from "@/components/ListingCard";

// Un aviso con las TRES insignias a la vez — el caso que se solapaba.
const listing = {
  id: "l1", title: "corola toyosa", description: "d", price: 2233333, currency: "PEN",
  category: "vehiculos", location: "Vitarte, Ate", imageUrl:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%23bfae90'/%3E%3C/svg%3E",
  date: "2026-07-10", featured: true, urgent: true, confidential: true, advertiser: "A", views: 0,
};

createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <div style={{ width: 280, padding: 20 }}>
      <ListingCard listing={listing} />
    </div>
  </MemoryRouter>,
);
