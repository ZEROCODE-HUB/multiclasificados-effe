import { createRoot } from "react-dom/client";
import AdminReports from "@/pages/admin/AdminReports";

createRoot(document.getElementById("root")!).render(<AdminReports role="superadmin" />);
