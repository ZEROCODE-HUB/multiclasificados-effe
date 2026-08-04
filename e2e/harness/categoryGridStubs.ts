// Categorías reales del catálogo, incluidas las de nombre más largo (que son
// las que desbordaban la tarjeta en móvil).
const cat = (id: string, name: string) => ({ id, name, icon: () => null, imageUrl: null });

export const useCategories = () => [
  cat("inmuebles", "Inmuebles"),
  cat("vehiculos", "Vehículos y Repuestos"),
  cat("empleos", "Empleos"),
  cat("maquinaria", "Maquinaria Pesada, Industrial y Herramientas"),
  cat("motos", "Motos, bicicletas y Repuestos"),
  cat("tecnologia", "Tecnología"),
  cat("servicios", "Servicios"),
  cat("insumos", "Insumos Materias Primas y Materiales"),
  cat("alimentos", "Alimentos y Productos Terminados"),
  cat("salud", "Salud, Belleza y Moda"),
  cat("eventos", "Eventos, Entretenimiento y Equipos Deportivos"),
  cat("mascotas", "Mascotas"),
];

export const fetchCategoryCounts = async () => ({});

// @/lib/categories
export const categoryPhoto = () =>
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='225'%3E%3Crect width='300' height='225' fill='%23555'/%3E%3C/svg%3E";
