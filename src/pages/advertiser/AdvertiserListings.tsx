import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListingRow } from "@/components/ListingRow";
import { PublishDraftDialog } from "@/components/PublishDraftDialog";
import { LocationPicker } from "@/components/LocationPicker";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { PlusCircle, ClipboardList, Eye, MessageSquare, TrendingUp, Search, SlidersHorizontal, ImagePlus, Loader2 } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import type { Listing } from "@/data/mockData";
import { useCategories } from "@/hooks/useCategories";
import {
  fetchMyListings, updateListing, deleteListing, setListingStatus, replaceMainListingPhoto,
  type MyListing, type ListingStatus, type ListingCondition,
} from "@/lib/listings";

// Agrupa los estados de la BD en las pestañas visibles de la UI.
type TabKey = "activos" | "pausados" | "vencidos" | "borradores";
const TAB_OF: Record<ListingStatus, TabKey | null> = {
  active: "activos",
  paused: "pausados",
  expired: "vencidos",
  rejected: "vencidos",
  sold: "vencidos",
  draft: "borradores",
  pending: "borradores",
};
const ROW_STATUS: Record<TabKey, "Activo" | "Pausado" | "Vencido" | "Borrador"> = {
  activos: "Activo",
  pausados: "Pausado",
  vencidos: "Vencido",
  // Un borrador nunca se publicó: llamarlo "Pausado" hacía creer que estuvo activo.
  borradores: "Borrador",
};

// Estado del formulario de edición.
interface EditState {
  id: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  location: string;
  lat: number | null;
  lng: number | null;
  category: string;
  condition: ListingCondition;
  imageUrl: string;
}

const AdvertiserListings = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const categories = useCategories();
  // Pestaña inicial: la del parámetro ?tab= (p. ej. al llegar desde "Guardar
  // en borradores"), si es una válida; si no, "Activos".
  const TAB_KEYS = ["activos", "pausados", "vencidos", "borradores"] as const;
  const paramTab = searchParams.get("tab") ?? "";
  const initialTab = (TAB_KEYS as readonly string[]).includes(paramTab) ? paramTab : "activos";
  const [listings, setListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Edición / eliminación
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const [toDelete, setToDelete] = useState<MyListing | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Borrador que se está publicando (cobro + activación) desde su fila.
  const [toPublish, setToPublish] = useState<MyListing | null>(null);
  const session = useSession();
  const [userEmail, setUserEmail] = useState("");

  const reload = () => fetchMyListings().then(setListings);

  useEffect(() => {
    fetchMyListings().then((rows) => {
      setListings(rows);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user.email ?? ""));
  }, []);

  const openEdit = (l: MyListing) => {
    setEdit({
      id: l.id,
      title: l.title,
      description: l.description ?? "",
      price: String(l.price ?? ""),
      currency: l.currency || "PEN",
      location: l.location ?? "",
      lat: l.lat ?? null,
      lng: l.lng ?? null,
      category: l.category ?? "",
      condition: l.condition ?? "na",
      imageUrl: l.imageUrl ?? "",
    });
  };

  const changePhoto = async (file: File | undefined) => {
    if (!file || !edit) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Archivo no válido", description: "Selecciona una imagen.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagen muy pesada", description: "La foto no debe superar 2 MB.", variant: "destructive" });
      return;
    }
    setPhotoSaving(true);
    try {
      const url = await replaceMainListingPhoto(edit.id, file);
      setEdit((e) => (e ? { ...e, imageUrl: url } : e));
      setListings((prev) => prev.map((l) => (l.id === edit.id ? { ...l, imageUrl: url } : l)));
      toast({ title: "Foto actualizada", description: "La portada del aviso se cambió correctamente." });
    } catch (err) {
      toast({ title: "No se pudo cambiar la foto", description: err instanceof Error ? err.message : "Intenta nuevamente.", variant: "destructive" });
    } finally {
      setPhotoSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    if (!edit.title.trim() || !edit.price.trim()) {
      toast({ title: "Faltan datos", description: "El título y el precio son obligatorios.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateListing(edit.id, {
        title: edit.title.trim(),
        description: edit.description.trim(),
        price: Number(edit.price) || 0,
        currency: edit.currency,
        location: edit.location.trim(),
        lat: edit.lat,
        lng: edit.lng,
        category_id: edit.category || undefined,
        condition: edit.condition,
      });
      // Refleja el cambio en memoria sin recargar todo.
      setListings((prev) =>
        prev.map((l) =>
          l.id === edit.id
            ? { ...l, title: edit.title.trim(), description: edit.description.trim(), price: Number(edit.price) || 0, currency: edit.currency, location: edit.location.trim(), lat: edit.lat, lng: edit.lng, category: edit.category || l.category, condition: edit.condition }
            : l
        )
      );
      setEdit(null);
      toast({ title: "Aviso actualizado", description: "Los cambios se guardaron correctamente." });
    } catch (e) {
      toast({ title: "No se pudo guardar", description: e instanceof Error ? e.message : "Intenta nuevamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteListing(toDelete.id);
      setListings((prev) => prev.filter((l) => l.id !== toDelete.id));
      setToDelete(null);
      toast({ title: "Aviso eliminado" });
    } catch (e) {
      toast({ title: "No se pudo eliminar", description: e instanceof Error ? e.message : "Intenta nuevamente.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const togglePause = async (l: Listing) => {
    const current = listings.find((x) => x.id === l.id);
    if (!current) return;
    const next: ListingStatus = current.status === "paused" ? "active" : "paused";
    try {
      await setListingStatus(l.id, next);
      setListings((prev) => prev.map((x) => (x.id === l.id ? { ...x, status: next } : x)));
      toast({ title: next === "paused" ? "Aviso pausado" : "Aviso reactivado" });
    } catch (e) {
      toast({ title: "No se pudo cambiar el estado", description: e instanceof Error ? e.message : "Intenta nuevamente.", variant: "destructive" });
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? listings.filter((l) => l.title.toLowerCase().includes(q)) : listings;
  }, [listings, query]);

  const byTab = (tab: TabKey) => filtered.filter((l) => TAB_OF[l.status] === tab);

  const totalViews = listings.reduce((a, l) => a + (l.views || 0), 0);
  const stats = [
    { label: "Avisos activos", value: byTab("activos").length, icon: ClipboardList, accent: "text-secondary" },
    { label: "Vistas totales", value: totalViews.toLocaleString(), icon: Eye, accent: "text-primary" },
    { label: "Total de avisos", value: listings.length, icon: MessageSquare, accent: "text-success" },
    { label: "Borradores", value: byTab("borradores").length, icon: TrendingUp, accent: "text-warning" },
  ];

  const renderList = (tab: TabKey) => {
    const rows = byTab(tab);
    if (loading) {
      return <Card><CardContent className="p-8 text-center text-muted-foreground">Cargando…</CardContent></Card>;
    }
    if (rows.length === 0) {
      return (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No tienes avisos en esta sección.
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="bg-card border border-border">
        <div className="hidden lg:grid grid-cols-[1fr_120px_120px_140px] gap-4 px-5 py-2.5 border-b border-border bg-muted/30">
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Aviso</span>
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Vistas</span>
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Estado</span>
          <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground text-right">Acciones</span>
        </div>
        <div className="divide-y divide-border">
          {rows.map((listing) => (
            <div key={listing.id} className="p-3 lg:p-4">
              <ListingRow
                listing={listing}
                status={ROW_STATUS[tab]}
                expiresAt={listing.expiresAt}
                rejectionReason={listing.status === "rejected" ? listing.rejectionReason : null}
                onView={(l) => navigate(`/aviso/${l.id}`)}
                onEdit={() => openEdit(listing)}
                onDelete={() => setToDelete(listing)}
                onTogglePause={tab === "activos" || tab === "pausados" ? togglePause : undefined}
                {...(tab === "borradores" && listing.status === "draft"
                  // `pending` también cae en esta pestaña, pero está en revisión:
                  // publicarlo lo saltaría la moderación.
                  ? { onPublish: () => setToPublish(listing) }
                  : {})}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout role="anunciante">
      <div className="space-y-6 animate-fade-in">
        {/* Premium header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-secondary">Gestión de avisos</p>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground mt-1">Mis avisos publicados</h1>
            <p className="text-sm text-muted-foreground mt-1">Administra el rendimiento de cada anuncio en un solo lugar.</p>
          </div>
          <Link to="/dashboard/anunciante/publicar" className="self-start lg:self-auto">
            <Button variant="hero" className="gap-2 h-11 px-5">
              <PlusCircle size={16} /> Nuevo aviso
            </Button>
          </Link>
        </div>

        {/* Premium summary strip — desktop only */}
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-card border border-border p-4 flex items-center gap-3 hover:border-secondary/40 transition-colors">
              <div className={`w-10 h-10 flex items-center justify-center bg-muted ${s.accent}`}>
                <s.icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{s.label}</p>
                <p className="text-xl font-extrabold text-foreground leading-tight">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <Tabs defaultValue={initialTab}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* El margen negativo debe igualar el padding de <main> (px-3 en móvil).
                Con -mx-4 la tira sobresalía 4px y la página entera scrolleaba en horizontal. */}
            <div className="-mx-3 sm:mx-0 px-3 sm:px-0 overflow-x-auto scrollbar-hide">
              <TabsList className="w-max">
                <TabsTrigger value="activos">Activos ({byTab("activos").length})</TabsTrigger>
                <TabsTrigger value="pausados">Pausados ({byTab("pausados").length})</TabsTrigger>
                <TabsTrigger value="vencidos">Vencidos ({byTab("vencidos").length})</TabsTrigger>
                <TabsTrigger value="borradores">Borradores ({byTab("borradores").length})</TabsTrigger>
              </TabsList>
            </div>

            {/* Toolbar — desktop only */}
            <div className="hidden lg:flex items-center gap-2">
              <div className="flex items-center bg-muted/50 border border-border h-9 w-64">
                <Search size={14} className="ml-3 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar en mis avisos…"
                  className="flex-1 bg-transparent px-2 text-xs outline-none"
                />
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 h-9">
                <SlidersHorizontal size={14} /> Filtros
              </Button>
            </div>
          </div>

          <TabsContent value="activos" className="mt-4">{renderList("activos")}</TabsContent>
          <TabsContent value="pausados" className="mt-4">{renderList("pausados")}</TabsContent>
          <TabsContent value="vencidos" className="mt-4">{renderList("vencidos")}</TabsContent>
          <TabsContent value="borradores" className="mt-4">{renderList("borradores")}</TabsContent>
        </Tabs>
      </div>

      {/* Diálogo de edición */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar aviso</DialogTitle>
            <DialogDescription>Actualiza la información de tu publicación.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="space-y-4">
              {/* Foto de portada */}
              <div>
                <Label>Foto de portada</Label>
                <div className="mt-1 flex items-center gap-4">
                  <div className="w-24 h-20 rounded-lg overflow-hidden bg-muted shrink-0 border">
                    {edit.imageUrl ? (
                      <img src={edit.imageUrl} alt="Portada" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <ImagePlus size={20} />
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      ref={photoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { changePhoto(e.target.files?.[0]); if (photoRef.current) photoRef.current.value = ""; }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => photoRef.current?.click()}
                      disabled={photoSaving}
                      className="gap-2"
                    >
                      {photoSaving ? <><Loader2 size={14} className="animate-spin" /> Subiendo…</> : <><ImagePlus size={14} /> Cambiar foto</>}
                    </Button>
                    <p className="text-[11px] text-muted-foreground mt-1">JPG o PNG, hasta 2 MB.</p>
                  </div>
                </div>
              </div>
              <div>
                <Label>Título *</Label>
                <Input
                  value={edit.title}
                  maxLength={80}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Categoría</Label>
                  <Select value={edit.category} onValueChange={(v) => setEdit({ ...edit, category: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona categoría" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Condición</Label>
                  <Select value={edit.condition} onValueChange={(v) => setEdit({ ...edit, condition: v as ListingCondition })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nuevo">Nuevo</SelectItem>
                      <SelectItem value="usado">Usado</SelectItem>
                      <SelectItem value="na">No aplica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Descripción</Label>
                <Textarea
                  value={edit.description}
                  maxLength={2000}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  className="mt-1 min-h-[120px]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <Label>Precio *</Label>
                  <Input
                    type="number"
                    value={edit.price}
                    onChange={(e) => setEdit({ ...edit, price: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Moneda</Label>
                  <Select value={edit.currency} onValueChange={(v) => setEdit({ ...edit, currency: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PEN">PEN (S/.)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <LocationPicker
                location={edit.location}
                onLocationChange={(v) => setEdit({ ...edit, location: v })}
                lat={edit.lat}
                lng={edit.lng}
                onCoordsChange={(la, ln) => setEdit({ ...edit, lat: la, lng: ln })}
              />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este aviso?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <span className="font-semibold text-foreground">{toDelete?.title}</span> de forma permanente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publicar un borrador: cobra y activa el aviso que YA existe en la BD.
          No lo vuelve a crear ni resube las imágenes. */}
      <PublishDraftDialog
        draft={toPublish}
        email={userEmail}
        fallbackName={session?.name ?? "Anunciante"}
        onClose={() => setToPublish(null)}
        onPublished={reload}
      />
    </DashboardLayout>
  );
};

export default AdvertiserListings;
