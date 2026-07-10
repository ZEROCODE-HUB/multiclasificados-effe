import { createRoot } from "react-dom/client";
import AdminUsers from "@/pages/admin/AdminUsers";

createRoot(document.getElementById("root")!).render(<AdminUsers role="superadmin" />);
