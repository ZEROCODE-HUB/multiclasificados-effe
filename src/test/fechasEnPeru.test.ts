import { describe, it, expect } from "vitest";
import { fechaDelDia, fechaLarga, fechaHoraLarga, fechaHoraCorta } from "@/lib/fechas";
import { mapCard } from "@/lib/listings";

/**
 * EL AVISO DEL 28 QUE SALÍA FECHADO EL 27.
 *
 * Lo reportó el cliente: "Hace 5 minutos coloqué este aviso y se publica con
 * fecha 27 ago 2026. Por favor que se visualice la fecha correcta, así como la
 * hora y minuto de la publicación."
 *
 * No era el reloj del servidor. La marca de tiempo se guarda bien, en UTC. Lo
 * que se hacía era recortarla a diez caracteres —tirando la hora— y releer el
 * resto con `new Date("2026-08-28")`. Un texto de SOLO FECHA lo interpreta
 * JavaScript como medianoche UTC, y pintado en hora del Perú retrocede cinco
 * horas: el día anterior. A todos los avisos y siempre.
 *
 * Estos tests fijan la zona a mano en vez de fiarse de la del equipo: si
 * dependieran de ella, pasarían en Lima y fallarían en el servidor de compilación.
 */

// 28 de agosto de 2026, 16:33 en el Perú = 21:33 UTC.
const PUBLICADO = "2026-08-28T21:33:00.000Z";
// Un aviso de noche: en Lima sigue siendo día 28; en UTC ya es 29.
const DE_NOCHE = "2026-08-29T02:15:00.000Z";

describe("el día se calcula en el Perú, no en UTC", () => {
  it("el aviso de las 16:33 es del 28, no del 27", () => {
    expect(fechaDelDia(PUBLICADO)).toBe("2026-08-28");
    expect(fechaLarga(PUBLICADO)).toMatch(/28/);
    expect(fechaLarga(PUBLICADO)).not.toMatch(/27/);
  });

  it("y el de las 21:15 sigue siendo del 28, aunque en UTC ya sea 29", () => {
    // El `.slice(0, 10)` de antes daba "2026-08-29": un día POR DELANTE. Es el
    // mismo fallo por el otro extremo, y este nadie lo había visto.
    expect(fechaDelDia(DE_NOCHE)).toBe("2026-08-28");
  });

  it("así falla el método viejo, para que quede escrito", () => {
    const comoAntes = new Date(PUBLICADO.slice(0, 10)).toLocaleDateString("es-PE", {
      timeZone: "America/Lima", day: "2-digit", month: "short", year: "numeric",
    });
    expect(comoAntes).toMatch(/27/);
    expect(fechaLarga(PUBLICADO)).not.toBe(comoAntes);
  });
});

describe("la hora y el minuto, que es lo que pidió", () => {
  it("la ficha del aviso los enseña", () => {
    const texto = fechaHoraLarga(PUBLICADO);
    expect(texto).toMatch(/28/);
    expect(texto).toMatch(/04:33|4:33/);
  });

  it("y la lista de Mis avisos también, en formato corto", () => {
    const texto = fechaHoraCorta(PUBLICADO);
    expect(texto).toMatch(/28\/08\/2026/);
    expect(texto).toMatch(/04:33|4:33/);
  });

  it("la hora es la del Perú aunque se mire desde otro país", () => {
    // Formatear con la zona del dispositivo daría una fecha distinta para el
    // mismo aviso según quién lo mire — y el cliente revisa desde varios sitios.
    expect(fechaHoraLarga(PUBLICADO)).toBe(
      new Date(PUBLICADO).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      }),
    );
  });
});

describe("una fecha suelta se queda donde está", () => {
  // La trampa de este módulo, y la misma que causó el fallo: pasarle un día ya
  // recortado ("2026-08-28") lo leería como medianoche UTC y lo devolvería
  // retrocedido al 27. Pasa de verdad: la fila de Mis avisos usa `publishedAt`
  // y cae a `date`, que es justo un día suelto.
  it("no retrocede un día al recibir solo la fecha", () => {
    expect(fechaDelDia("2026-08-28")).toBe("2026-08-28");
    expect(fechaLarga("2026-08-28")).toMatch(/28/);
    expect(fechaHoraCorta("2026-08-28")).toMatch(/28\/08\/2026/);
  });
});

describe("lo que no es una fecha no se inventa", () => {
  it("vacío, nulo o basura devuelven cadena vacía", () => {
    expect(fechaDelDia(null)).toBe("");
    expect(fechaDelDia(undefined)).toBe("");
    expect(fechaDelDia("")).toBe("");
    expect(fechaHoraLarga("no-es-fecha")).toBe("");
    expect(fechaLarga("no-es-fecha")).toBe("");
  });
});

describe("el aviso que llega de la base ya trae bien las dos cosas", () => {
  const fila = (extra: Record<string, unknown> = {}) => ({
    id: "00000000-0000-0000-0000-000000000001",
    title: "Postres en Huanchaco", description: null, price: "0", currency: "PEN",
    condition: null, category_id: "restaurantes", location: "Huanchaco, Trujillo",
    department: "13", lat: null, lng: null, featured: true, urgent: true,
    confidential: true, views: 0, published_at: PUBLICADO,
    created_at: "2026-08-20T00:00:00Z", expires_at: null, advertiser: "Cesar",
    image_url: null, ...extra,
  }) as never;

  it("el día, en hora del Perú", () => {
    expect(mapCard(fila()).date).toBe("2026-08-28");
  });

  it("y el instante completo, para poder enseñar la hora", () => {
    expect(mapCard(fila()).publishedAt).toBe(PUBLICADO);
  });

  it("sin fecha de publicación se cae a la de creación", () => {
    const l = mapCard(fila({ published_at: null }));
    expect(l.date).toBe("2026-08-19"); // medianoche UTC del 20 = 19 en Lima
    expect(l.publishedAt).toBe("2026-08-20T00:00:00Z");
  });
});
