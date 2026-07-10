// Las categorías ya no viven aquí: las define el staff y se leen de la BD.
// Ver `src/lib/categories.ts` y el hook `useCategories()`.

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  location: string;
  imageUrl: string;
  date: string;
  featured: boolean;
  // Insignias visuales según los adicionales que pagó el anunciante.
  urgent?: boolean;
  confidential?: boolean;
  advertiser: string;
  views: number;
  lat?: number | null;
  lng?: number | null;
}

export const featuredListings: Listing[] = [
  {
    id: "1",
    title: "Departamento 3 dormitorios en Miraflores",
    description: "Hermoso departamento con vista al mar, 120m², 2 baños, estacionamiento incluido.",
    price: 1200,
    currency: "USD",
    category: "inmuebles",
    location: "Lima, Miraflores",
    imageUrl: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=300&fit=crop",
    date: "2026-03-10",
    featured: true,
    advertiser: "Inmobiliaria Pacífico",
    views: 342,
  },
  {
    id: "2",
    title: "Toyota Corolla 2024 - Uso particular",
    description: "15,000 km recorridos, full equipo, papeles en regla, único dueño.",
    price: 22500,
    currency: "USD",
    category: "vehiculos",
    location: "Lima, San Isidro",
    imageUrl: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=400&h=300&fit=crop",
    date: "2026-03-09",
    featured: true,
    advertiser: "Carlos Mendoza",
    views: 189,
  },
  {
    id: "3",
    title: "Desarrollador Full Stack - Remoto",
    description: "Empresa fintech busca desarrollador con experiencia en React y Node.js. Sueldo competitivo.",
    price: 8000,
    currency: "PEN",
    category: "empleos",
    location: "Lima, Remoto",
    imageUrl: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&h=300&fit=crop",
    date: "2026-03-11",
    featured: true,
    advertiser: "TechPeru SAC",
    views: 567,
  },
  {
    id: "4",
    title: "iPhone 15 Pro Max 256GB",
    description: "Nuevo, sellado, garantía Apple 1 año. Color titanio negro.",
    price: 5200,
    currency: "PEN",
    category: "tecnologia",
    location: "Lima, Surco",
    imageUrl: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400&h=300&fit=crop",
    date: "2026-03-08",
    featured: true,
    advertiser: "TecnoStore",
    views: 423,
  },
  {
    id: "5",
    title: "Servicio de Mudanzas Profesional",
    description: "Mudanzas locales y nacionales. Embalaje incluido. Seguro de carga.",
    price: 350,
    currency: "PEN",
    category: "servicios",
    location: "Lima Metropolitana",
    imageUrl: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=400&h=300&fit=crop",
    date: "2026-03-07",
    featured: true,
    advertiser: "Mudanzas Express",
    views: 156,
  },
  {
    id: "6",
    title: "Curso de Marketing Digital Certificado",
    description: "120 horas, certificación internacional, modalidad online con clases en vivo.",
    price: 1500,
    currency: "PEN",
    category: "educacion-finanzas",
    location: "Online",
    imageUrl: "https://images.unsplash.com/photo-1432888498266-38ffec3eaf0a?w=400&h=300&fit=crop",
    date: "2026-03-06",
    featured: true,
    advertiser: "Academia Digital Pro",
    views: 298,
  },
];

export const advertiserStats = {
  activeListings: 12,
  expiringListings: 3,
  unreadMessages: 7,
  totalViews: 4521,
  applicationsReceived: 23,
};
