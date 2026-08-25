import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Subida anticipada: los adjuntos viajan mientras el usuario rellena el
 * formulario, no cuando pulsa "Publicar".
 *
 * Lo medido antes de escribir esto: un aviso con el paquete completo sube 1,2 MB
 * de fotos y hasta 46 MB de vídeo, y todo empezaba en el clic del botón. En una
 * conexión móvil peruana son minutos mirando un botón quieto. La foto, en
 * cambio, se elige tres minutos antes de pulsar: ese hueco es lo que se
 * aprovecha aquí.
 */

const storage: {
  subidas: Array<{ bucket: string; path: string; size: number }>;
  borrados: Array<{ bucket: string; path: string }>;
  fallarVeces: number;
} = { subidas: [], borrados: [], fallarVeces: 0 };

const tus = { intentos: 0, fallar: false, ultimo: null as Record<string, unknown> | null };

// La libreria se carga con import() dinamico solo al subir un video.
vi.mock("tus-js-client", () => ({
  Upload: class {
    opts: Record<string, unknown>;
    constructor(_file: File, opts: Record<string, unknown>) { this.opts = opts; tus.ultimo = opts; }
    findPreviousUploads() { return Promise.resolve([]); }
    resumeFromPreviousUpload() { /* no hay nada que retomar en las pruebas */ }
    abort() { return Promise.resolve(); }
    start() {
      tus.intentos++;
      if (tus.fallar) (this.opts.onError as (e: Error) => void)(new Error("tus caido"));
      else (this.opts.onSuccess as () => void)();
    }
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabaseUrl: "https://proyecto.supabase.co",
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "jwt-de-prueba" } } }) },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, file: File) => {
          if (storage.fallarVeces > 0) {
            storage.fallarVeces--;
            return { error: { message: "se cayó la red" } };
          }
          storage.subidas.push({ bucket, path, size: file.size });
          return { error: null };
        },
        remove: async (paths: string[]) => {
          for (const p of paths) storage.borrados.push({ bucket, path: p });
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${bucket}/${path}` } }),
      }),
    },
  },
}));

import {
  nuevoIdDeAviso, subirAdjunto, borrarAdjunto,
  porcentajeSubido, textoDePendiente, bytesPendientes,
  type EstadoSubida,
} from "@/lib/subidaAnticipada";

const archivo = (nombre: string, tipo: string, kb: number) =>
  new File([new Uint8Array(kb * 1024)], nombre, { type: tipo });

const USUARIO = "11111111-1111-4111-8111-111111111111";
const AVISO = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  storage.subidas = [];
  storage.borrados = [];
  storage.fallarVeces = 0;
  tus.intentos = 0; tus.fallar = false; tus.ultimo = null;
});

describe("el identificador del aviso se reserva en el navegador", () => {
  it("es un UUID válido, que es lo que la base de datos acepta como id", () => {
    expect(nuevoIdDeAviso()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("no se repite", () => {
    const vistos = new Set(Array.from({ length: 500 }, () => nuevoIdDeAviso()));
    expect(vistos.size).toBe(500);
  });

  it("sigue funcionando sin la API de aleatoriedad del navegador", () => {
    // En un WebView antiguo o sobre http:// sin cifrar, `crypto.randomUUID` no
    // existe. Devolver undefined dejaría la ruta del archivo en
    // "usuario/undefined/portada.webp" y todos los avisos compartirían carpeta.
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", undefined);
    try {
      expect(nuevoIdDeAviso()).toMatch(/^[0-9a-f-]{36}$/i);
    } finally {
      vi.stubGlobal("crypto", real);
    }
  });
});

describe("subir un adjunto", () => {
  it("la ruta empieza por el id del usuario: es lo único que mira la regla del bucket", async () => {
    const r = await subirAdjunto("imagen", USUARIO, AVISO, "portada", archivo("foto.webp", "image/webp", 200));
    expect(r.path.startsWith(`${USUARIO}/`)).toBe(true);
    expect(r.path).toBe(`${USUARIO}/${AVISO}/portada.webp`);
  });

  it("cada tipo va a su bucket", async () => {
    // El video no aparece aqui a proposito: va por la via reanudable, que se
    // comprueba mas abajo. Lo que se fija aqui es que imagen y PDF no se crucen.
    const img = await subirAdjunto("imagen", USUARIO, AVISO, "portada", archivo("f.webp", "image/webp", 10));
    const pdf = await subirAdjunto("pdf", USUARIO, AVISO, "documento", archivo("d.pdf", "application/pdf", 10));
    expect(storage.subidas.map((s) => s.bucket)).toEqual(["listing-images", "listing-docs"]);
    expect(img.path).toContain(AVISO);
    expect(pdf.path).toContain(AVISO);
  });

  it("la extensión sale del tipo, no del nombre", async () => {
    // Una foto entra como .jpg y sale del optimizador convertida en WebP.
    // Guardarla como .jpg hace que algunos navegadores se nieguen a pintarla.
    const r = await subirAdjunto("imagen", USUARIO, AVISO, "portada", archivo("vacaciones.jpg", "image/webp", 50));
    expect(r.path.endsWith(".webp")).toBe(true);
  });

  it("cambiar la foto de un hueco sobrescribe, no acumula", async () => {
    // La ruta lleva el HUECO (portada, foto-2), no el nombre del archivo. Si
    // llevara el nombre, probar cinco fotos dejaría cinco archivos pagando sitio.
    const a = await subirAdjunto("imagen", USUARIO, AVISO, "portada", archivo("primera.webp", "image/webp", 20));
    const b = await subirAdjunto("imagen", USUARIO, AVISO, "portada", archivo("segunda.webp", "image/webp", 30));
    expect(a.path).toBe(b.path);
  });

  it("devuelve la URL pública, salvo en documentos, que es un bucket privado", async () => {
    const img = await subirAdjunto("imagen", USUARIO, AVISO, "portada", archivo("f.webp", "image/webp", 10));
    expect(img.url).toContain("listing-images");
    const pdf = await subirAdjunto("pdf", USUARIO, AVISO, "documento", archivo("d.pdf", "application/pdf", 10));
    // Una URL pública de un bucket privado da 400 al abrirla: mejor vacía y que
    // se pida firmada en el momento.
    expect(pdf.url).toBe("");
  });

  it("reintenta una vez: en móvil el primer intento se pierde al cambiar de antena", async () => {
    storage.fallarVeces = 1;
    const r = await subirAdjunto("imagen", USUARIO, AVISO, "portada", archivo("f.webp", "image/webp", 10));
    expect(r.path).toBeTruthy();
    expect(storage.subidas).toHaveLength(1);
  });

  it("si falla dos veces se rinde con el motivo, y publicar lo reintentará", async () => {
    storage.fallarVeces = 2;
    await expect(
      subirAdjunto("imagen", USUARIO, AVISO, "portada", archivo("f.webp", "image/webp", 10)),
    ).rejects.toThrow(/se cayó la red/);
  });

  it("no empieza siquiera si ya se canceló", async () => {
    // Al reiniciar el formulario se cortan las subidas en vuelo: sin esto, la
    // foto del aviso que se acaba de publicar iría a la carpeta del siguiente.
    const ac = new AbortController();
    ac.abort();
    await expect(
      subirAdjunto("imagen", USUARIO, AVISO, "portada", archivo("f.webp", "image/webp", 10), { signal: ac.signal }),
    ).rejects.toThrow(/cancelada/);
    expect(storage.subidas).toHaveLength(0);
  });
});

describe("los videos van por la via reanudable", () => {
  // Un video son hasta 15 MB. La subida normal es todo o nada: si se corta al
  // 80 % vuelve a empezar por cero, y en una conexion movil peruana eso pasa a
  // menudo. TUS retoma por donde iba.
  it("un video no usa la subida del tiron", async () => {
    await subirAdjunto("video", USUARIO, AVISO, "video-1", archivo("v.mp4", "video/mp4", 15 * 1024));
    expect(tus.intentos).toBe(1);
    expect(storage.subidas).toHaveLength(0); // no paso por la via normal
  });

  it("una foto NO la usa: para 200 KB es maquinaria de mas", async () => {
    await subirAdjunto("imagen", USUARIO, AVISO, "portada", archivo("f.webp", "image/webp", 200));
    expect(tus.intentos).toBe(0);
    expect(storage.subidas).toHaveLength(1);
  });

  it("va al bucket y la ruta correctos, con la sesion del usuario", async () => {
    await subirAdjunto("video", USUARIO, AVISO, "video-2", archivo("v.mp4", "video/mp4", 1024));
    expect(tus.ultimo).toMatchObject({
      endpoint: "https://proyecto.supabase.co/storage/v1/upload/resumable",
      metadata: { bucketName: "listing-videos", objectName: `${USUARIO}/${AVISO}/video-2.mp4` },
    });
    expect((tus.ultimo!.headers as Record<string, string>).authorization).toBe("Bearer jwt-de-prueba");
  });

  it("el trozo es de 6 MB exactos: lo exige el servidor, no es una eleccion", async () => {
    await subirAdjunto("video", USUARIO, AVISO, "video-1", archivo("v.mp4", "video/mp4", 1024));
    expect(tus.ultimo!.chunkSize).toBe(6 * 1024 * 1024);
  });

  it("si la via reanudable falla, se sube del tiron igual", async () => {
    // Es preferible una subida lenta a un adjunto que no llega nunca.
    tus.fallar = true;
    const r = await subirAdjunto("video", USUARIO, AVISO, "video-1", archivo("v.mp4", "video/mp4", 1024));
    expect(r.path).toBe(`${USUARIO}/${AVISO}/video-1.mp4`);
    expect(storage.subidas).toHaveLength(1);
  });

  it("pero si se cancelo, no se repliega: era cancelar, no fallar", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      subirAdjunto("video", USUARIO, AVISO, "video-1", archivo("v.mp4", "video/mp4", 1024), { signal: ac.signal }),
    ).rejects.toThrow(/cancelada/);
    expect(storage.subidas).toHaveLength(0);
  });
});

describe("borrar un adjunto", () => {
  it("lo quita del bucket que le toca", async () => {
    await borrarAdjunto("video", `${USUARIO}/${AVISO}/video-1.mp4`);
    expect(storage.borrados).toEqual([{ bucket: "listing-videos", path: `${USUARIO}/${AVISO}/video-1.mp4` }]);
  });
});

describe("el progreso se cuenta por peso, no por número de archivos", () => {
  const listo = (): EstadoSubida => ({ fase: "lista", subido: { path: "x", url: "y" } });
  const subiendo = (): EstadoSubida => ({ fase: "subiendo" });

  it("una foto terminada de cuatro no es el 25% si las otras son vídeos", () => {
    // Este es el caso que hacía que la barra se quedara clavada: la foto son
    // 200 KB y cada vídeo 15 MB. Por número iría al 25%; de verdad va al 0,4%.
    const adjuntos = [
      { file: archivo("f.webp", "image/webp", 200), estado: listo() },
      { file: archivo("v1.mp4", "video/mp4", 15 * 1024), estado: subiendo() },
      { file: archivo("v2.mp4", "video/mp4", 15 * 1024), estado: subiendo() },
      { file: archivo("v3.mp4", "video/mp4", 15 * 1024), estado: subiendo() },
    ];
    expect(porcentajeSubido(adjuntos)).toBeLessThan(2);
  });

  it("con todo subido es 100", () => {
    const adjuntos = [
      { file: archivo("f.webp", "image/webp", 200), estado: listo() },
      { file: archivo("v.mp4", "video/mp4", 15 * 1024), estado: listo() },
    ];
    expect(porcentajeSubido(adjuntos)).toBe(100);
  });

  it("sin adjuntos es 100: no hay nada pendiente", () => {
    expect(porcentajeSubido([])).toBe(100);
    expect(textoDePendiente([])).toBeNull();
  });

  it("cuenta los bytes hechos y el total", () => {
    const adjuntos = [
      { file: archivo("a", "image/webp", 100), estado: listo() },
      { file: archivo("b", "image/webp", 300), estado: subiendo() },
    ];
    expect(bytesPendientes(adjuntos)).toEqual({ hechos: 100 * 1024, total: 400 * 1024 });
  });

  it("dice cuántos megas faltan cuando la espera se va a notar", () => {
    const adjuntos = [{ file: archivo("v.mp4", "video/mp4", 15 * 1024), estado: subiendo() }];
    expect(textoDePendiente(adjuntos)).toMatch(/Faltan 15\.0 MB/);
  });

  it("con poco pendiente no asusta con una cifra", () => {
    const adjuntos = [{ file: archivo("f.webp", "image/webp", 120), estado: subiendo() }];
    expect(textoDePendiente(adjuntos)).toBe("Terminando de subir…");
  });

  it("lo que aun no arranco tampoco: sin sesion no hay nada subiendo", () => {
    // Descubierto al correr la suite: sin sesion no se puede subir (la ruta
    // necesita el id del usuario), y el adjunto se quedaba en "espera". La
    // pantalla ensenaba "terminando de subir..." para siempre debajo de un boton
    // que en realidad estaba listo para publicar.
    const adjuntos = [{ file: archivo("f.webp", "image/webp", 200), estado: { fase: "espera" } as EstadoSubida }];
    expect(textoDePendiente(adjuntos)).toBeNull();
    // Pero sigue contando como no subido: el porcentaje no puede mentir.
    expect(porcentajeSubido(adjuntos)).toBe(0);
  });

  it("lo que falló no se cuenta como pendiente: lo reintenta publicar", () => {
    const adjuntos = [
      { file: archivo("a", "image/webp", 100), estado: listo() },
      { file: archivo("b", "image/webp", 100), estado: { fase: "error", motivo: "x" } as EstadoSubida },
    ];
    expect(textoDePendiente(adjuntos)).toBeNull();
  });
});
