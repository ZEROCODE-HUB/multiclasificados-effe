// REQ-08: estadísticas reales del anunciante (vía RPC advertiser_stats).
import { supabase } from "@/lib/supabase";

export interface AdvertiserStatsData {
  totals: { views: number; contacts: number; messages: number; applications: number };
  listings: { title: string; views: number; contacts: number }[];
  trend: { day: string; vistas: number; contactos: number }[];
}

const EMPTY: AdvertiserStatsData = {
  totals: { views: 0, contacts: 0, messages: 0, applications: 0 },
  listings: [],
  trend: [],
};

// Métricas públicas del landing (conteos exactos de la BD).
export interface PlatformStats {
  activeListings: number;
  totalUsers: number;
  reviews: number;
  satisfaction: number | null;
}

export async function fetchPlatformStats(): Promise<PlatformStats | null> {
  try {
    const { data, error } = await supabase.rpc("platform_stats");
    if (error) throw error;
    const d = data as { active_listings?: number; total_users?: number; reviews?: number; satisfaction?: number | null };
    return {
      activeListings: Number(d?.active_listings) || 0,
      totalUsers: Number(d?.total_users) || 0,
      reviews: Number(d?.reviews) || 0,
      satisfaction: d?.satisfaction == null ? null : Number(d.satisfaction),
    };
  } catch {
    return null;
  }
}

// Conteo real de avisos activos por categoría (para el grid del landing).
export async function fetchCategoryCounts(): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase.rpc("category_counts");
    if (error) throw error;
    return (data as Record<string, number>) ?? {};
  } catch {
    return {};
  }
}

export async function fetchAdvertiserStats(): Promise<AdvertiserStatsData> {
  try {
    const { data, error } = await supabase.rpc("advertiser_stats");
    if (error) throw error;
    const d = data as {
      totals?: Record<string, number>;
      listings?: { title: string; views: number; contacts: number }[];
      trend?: { day: string; vistas: number; contactos: number }[];
    };
    return {
      totals: {
        views: Number(d?.totals?.views) || 0,
        contacts: Number(d?.totals?.contacts) || 0,
        messages: Number(d?.totals?.messages) || 0,
        applications: Number(d?.totals?.applications) || 0,
      },
      listings: (d?.listings ?? []).map((l) => ({
        title: l.title,
        views: Number(l.views) || 0,
        contacts: Number(l.contacts) || 0,
      })),
      trend: (d?.trend ?? []).map((t) => ({
        day: t.day,
        vistas: Number(t.vistas) || 0,
        contactos: Number(t.contactos) || 0,
      })),
    };
  } catch {
    return EMPTY;
  }
}
