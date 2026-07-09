/**
 * Stubs de los módulos con los que AdminUsers habla al backend. Se inyectan por
 * alias de esbuild al construir el bundle del harness (ver avatarLayout.spec.ts).
 * El componente que se monta es el REAL; solo se corta el acceso a Supabase.
 */

// Nombres cortos (nunca fallaron) y largos (los que aplastaban el avatar).
const NAMES = [
  "Ana García",
  "Luis Paz",
  "María Fernanda de los Ángeles Villanueva Castromonte",
  "Juan Carlos Alberto Rodríguez Del Águila Sotomayor",
];

export const USERS = NAMES.map((full_name, i) => ({
  id: `24d479cf-52ce-40f4-b634-886eae34a7d${i}`,
  full_name,
  email: `usuario.numero.${i}.con.correo.largo@correoempresarial.com.pe`,
  status: "active",
  verified: true,
  roles: "buscador",
  listings_count: 0,
  suspended_until: null,
  rating: 0,
  created_at: "2026-01-01T00:00:00Z",
}));

// --- @/lib/admin
export const fetchAdminUsers = async () => ({ data: USERS, real: true });
export const setUserStatus = async () => {};
export const verifyUser = async () => {};
export const deleteUser = async () => {};
export const setUserRole = async () => {};
export const grantCredits = async () => 0;

// --- @/hooks/usePermissions
export const usePermissions = () => ({ can: () => true });

// --- @/lib/supabase
export const supabase = { functions: { invoke: async () => ({ data: null, error: null }) } };

// --- @/hooks/use-toast
export const toast = () => {};
export const useToast = () => ({ toast, dismiss: () => {}, toasts: [] });
