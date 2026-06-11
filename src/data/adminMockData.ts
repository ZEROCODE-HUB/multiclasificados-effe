export const adminKpis = {
  users: 15420,
  activeListings: 8240,
  pendingListings: 142,
  revenue: 248500,
  applications: 3120,
  reportsOpen: 17,
};

export const revenueSeries = [
  { mes: "Sep", ingresos: 32000, usuarios: 820 },
  { mes: "Oct", ingresos: 38500, usuarios: 940 },
  { mes: "Nov", ingresos: 41200, usuarios: 1020 },
  { mes: "Dic", ingresos: 47800, usuarios: 1240 },
  { mes: "Ene", ingresos: 52100, usuarios: 1380 },
  { mes: "Feb", ingresos: 58400, usuarios: 1510 },
];

export const categoryDistribution = [
  { name: "Inmuebles", value: 2150 },
  { name: "Vehículos", value: 1820 },
  { name: "Empleos", value: 2310 },
  { name: "Tecnología", value: 980 },
  { name: "Servicios", value: 1620 },
  { name: "Otros", value: 760 },
];

export type AdminListingStatus = "Pendiente" | "Activo" | "Rechazado" | "Destacado";
export const adminListings = [
  { id: "AV-10241", title: "Departamento Miraflores 3 dorm.", advertiser: "Inmobiliaria Pacífico", category: "Inmuebles", status: "Pendiente" as AdminListingStatus, date: "2026-06-09", price: "USD 1,200" },
  { id: "AV-10240", title: "Toyota Corolla 2024 full", advertiser: "Carlos Mendoza", category: "Vehículos", status: "Activo" as AdminListingStatus, date: "2026-06-09", price: "USD 22,500" },
  { id: "AV-10239", title: "Desarrollador Full Stack remoto", advertiser: "TechPeru SAC", category: "Empleos", status: "Destacado" as AdminListingStatus, date: "2026-06-08", price: "PEN 8,000" },
  { id: "AV-10238", title: "iPhone 15 Pro Max sellado", advertiser: "TecnoStore", category: "Tecnología", status: "Pendiente" as AdminListingStatus, date: "2026-06-08", price: "PEN 5,200" },
  { id: "AV-10237", title: "Servicio de mudanzas express", advertiser: "Mudanzas Express", category: "Servicios", status: "Rechazado" as AdminListingStatus, date: "2026-06-07", price: "PEN 350" },
  { id: "AV-10236", title: "Curso Marketing Digital", advertiser: "Academia Digital Pro", category: "Educación", status: "Activo" as AdminListingStatus, date: "2026-06-07", price: "PEN 1,500" },
];

export type AdminUserStatus = "Activo" | "Suspendido" | "Pendiente";
export const adminUsers = [
  { id: "U-9001", name: "Juan Mendoza", email: "juan@empresa.pe", role: "Anunciante", status: "Activo" as AdminUserStatus, date: "2025-11-12", listings: 12 },
  { id: "U-9002", name: "Ana García", email: "ana.garcia@gmail.com", role: "Buscador", status: "Activo" as AdminUserStatus, date: "2025-12-04", listings: 0 },
  { id: "U-9003", name: "Inmobiliaria Pacífico", email: "contacto@pacifico.pe", role: "Anunciante", status: "Activo" as AdminUserStatus, date: "2025-08-22", listings: 87 },
  { id: "U-9004", name: "Pedro Suárez", email: "psuarez@correo.com", role: "Buscador", status: "Pendiente" as AdminUserStatus, date: "2026-06-01", listings: 0 },
  { id: "U-9005", name: "Spam Bot 21", email: "fake@temp.io", role: "Anunciante", status: "Suspendido" as AdminUserStatus, date: "2026-05-10", listings: 3 },
  { id: "U-9006", name: "TechPeru SAC", email: "rrhh@techperu.pe", role: "Anunciante", status: "Activo" as AdminUserStatus, date: "2024-10-15", listings: 42 },
];

export const recentActivity = [
  { who: "Carlos Mendoza", action: "publicó un nuevo aviso", target: "Toyota Corolla 2024", time: "Hace 5 min" },
  { who: "Moderador #2", action: "aprobó", target: "AV-10238", time: "Hace 12 min" },
  { who: "Ana García", action: "reportó un aviso", target: "AV-10199", time: "Hace 28 min" },
  { who: "Sistema", action: "procesó pago plan Pro", target: "TechPeru SAC", time: "Hace 1 h" },
  { who: "Pedro Suárez", action: "se registró", target: "Nuevo Buscador", time: "Hace 2 h" },
];

export const auditLogs = [
  { id: "L-2201", actor: "superadmin@effe.pe", action: "Cambió rol", entity: "U-9002 → Moderador", ip: "190.232.10.4", time: "2026-06-10 14:32" },
  { id: "L-2200", actor: "admin@effe.pe", action: "Eliminó aviso", entity: "AV-10210", ip: "200.48.5.21", time: "2026-06-10 13:18" },
  { id: "L-2199", actor: "superadmin@effe.pe", action: "Actualizó plan", entity: "Plan Pro → S/ 89", ip: "190.232.10.4", time: "2026-06-10 11:02" },
  { id: "L-2198", actor: "admin@effe.pe", action: "Suspendió usuario", entity: "U-9005", ip: "200.48.5.21", time: "2026-06-09 17:45" },
  { id: "L-2197", actor: "sistema", action: "Backup completo", entity: "DB principal", ip: "internal", time: "2026-06-09 03:00" },
];

export const integrations = [
  { name: "Stripe", desc: "Procesador de pagos", status: "Conectado", color: "success" },
  { name: "Mailgun", desc: "Envío transaccional de correos", status: "Conectado", color: "success" },
  { name: "Google Analytics", desc: "Métricas y comportamiento", status: "Conectado", color: "success" },
  { name: "Twilio", desc: "SMS y WhatsApp", status: "Desconectado", color: "muted" },
  { name: "Cloudinary", desc: "Hospedaje de imágenes", status: "Conectado", color: "success" },
  { name: "Slack", desc: "Notificaciones internas", status: "Pendiente", color: "warning" },
];

export const plans = [
  { id: "free", name: "Gratis", price: "S/ 0", listings: 3, featured: 0, active: 12350 },
  { id: "basic", name: "Básico", price: "S/ 29", listings: 15, featured: 2, active: 1820 },
  { id: "pro", name: "Pro", price: "S/ 89", listings: 60, featured: 10, active: 540 },
  { id: "enterprise", name: "Enterprise", price: "A medida", listings: 999, featured: 100, active: 32 },
];

export const reportedConversations = [
  { id: "R-3301", reporter: "Ana García", reported: "Spam Bot 21", reason: "Estafa / phishing", date: "2026-06-09", status: "Abierto" },
  { id: "R-3300", reporter: "Pedro Suárez", reported: "Carlos Mendoza", reason: "Contenido engañoso", date: "2026-06-08", status: "En revisión" },
  { id: "R-3299", reporter: "María López", reported: "TecnoStore", reason: "Precio incorrecto", date: "2026-06-07", status: "Resuelto" },
];
