// Comprime una imagen EN EL NAVEGADOR antes de subirla a Supabase.
//
// Antes se subía el archivo tal cual: fotos de móvil de 3-8 MB entraban al bucket
// sin tocar y luego se servían enormes. Aquí la reducimos una sola vez, con buena
// calidad, y guardamos ya el resultado liviano. Al servirla no se re-procesa, así
// que se ve tal como quedó (sin la pérdida del redimensionado al vuelo).
//
// Redimensiona el lado mayor a MAX_EDGE (conservando la proporción) y exporta a
// WebP. Si algo falla —o el navegador no soporta WebP en canvas— devuelve el
// archivo original para no bloquear la publicación.

const MAX_EDGE = 1600;   // suficiente para la foto grande del detalle
const QUALITY = 0.82;    // alta: se comprime una vez, no queremos que se note

export async function compressImage(file: File): Promise<File> {
  // Solo imágenes rasterizadas. Un SVG o algo raro se sube tal cual.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close?.(); return file; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    // Si el canvas no dio WebP, o "comprimido" pesa más que el original, no vale la pena.
    if (!blob || !blob.type.includes("webp") || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file; // ante cualquier fallo, subimos el original
  }
}
