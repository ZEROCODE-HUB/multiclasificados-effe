import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import MessagesPage from "@/pages/shared/MessagesPage";

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/dashboard/buscador/mensajes?c=conv-1"]}>
    <MessagesPage role="buscador" />
  </MemoryRouter>,
);
