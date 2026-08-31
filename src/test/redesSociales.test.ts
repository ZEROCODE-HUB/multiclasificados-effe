import { describe, it, expect } from "vitest";
import { enlaceDeRed, normalizarRedes, REDES, NOMBRE_RED } from "@/lib/redesSociales";

/**
 * B-16 — los iconos de redes sociales del pie.
 *
 * El valor lo teclea una persona en un campo de texto del panel y termina
 * dentro de un `<a href>` de la portada, que ve todo el mundo. Ese camino
 * —campo libre → atributo href— es exactamente por donde entra un XSS, así que
 * la mitad de estas pruebas son sobre lo que NO debe pasar el filtro.
 */

describe("lo que se acepta", () => {
  it("un enlace completo se deja como está", () => {
    expect(enlaceDeRed("facebook", "https://www.facebook.com/coleffe"))
      .toBe("https://www.facebook.com/coleffe");
  });

  it("sin esquema se asume https, que es como lo escribe la gente", () => {
    expect(enlaceDeRed("instagram", "instagram.com/coleffe"))
      .toBe("https://instagram.com/coleffe");
    expect(enlaceDeRed("linkedin", "www.linkedin.com/company/coleffe"))
      .toBe("https://www.linkedin.com/company/coleffe");
  });

  it("los espacios de un copiar y pegar no rompen nada", () => {
    expect(enlaceDeRed("youtube", "  https://youtube.com/@coleffe  "))
      .toBe("https://youtube.com/@coleffe");
  });
});

describe("WhatsApp se guarda como número, no como enlace", () => {
  it("el número del cliente se convierte en su enlace", () => {
    // Es lo que pidió: "este último se conectará al numero +51 903 375 308".
    expect(enlaceDeRed("whatsapp", "+51 903 375 308")).toBe("https://wa.me/51903375308");
    expect(enlaceDeRed("whatsapp", "51903375308")).toBe("https://wa.me/51903375308");
  });

  it("si pegaron el enlace entero, también vale", () => {
    // Obligar a borrar el "https://wa.me/" sería una trampa tonta para quien
    // administra: lo natural es pegar lo que te da WhatsApp.
    expect(enlaceDeRed("whatsapp", "https://wa.me/51903375308"))
      .toBe("https://wa.me/51903375308");
  });

  it("un número a medias no genera un enlace roto", () => {
    // `wa.me/5` abre WhatsApp con un error y el usuario cree que la web falla.
    expect(enlaceDeRed("whatsapp", "903")).toBeNull();
    expect(enlaceDeRed("whatsapp", "+51")).toBeNull();
  });
});

describe("lo que NO puede llegar al href", () => {
  it("javascript: no pasa", () => {
    expect(enlaceDeRed("facebook", "javascript:alert(1)")).toBeNull();
  });

  it("ni disfrazado de mayúsculas o con espacios en medio", () => {
    // Contra esto es contra lo que fallan las expresiones regulares, y por eso
    // el filtro usa el parser de URL del navegador y no una regex.
    expect(enlaceDeRed("facebook", "JaVaScRiPt:alert(1)")).toBeNull();
    expect(enlaceDeRed("facebook", "java\tscript:alert(1)")).toBeNull();
    expect(enlaceDeRed("facebook", " javascript:alert(1)")).toBeNull();
  });

  it("tampoco data: ni vbscript: ni file:", () => {
    expect(enlaceDeRed("tiktok", "data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(enlaceDeRed("tiktok", "vbscript:msgbox(1)")).toBeNull();
    expect(enlaceDeRed("tiktok", "file:///etc/passwd")).toBeNull();
  });

  it("vacío o basura no pintan un icono muerto", () => {
    // Un icono que no lleva a ninguna parte es peor que no tener icono.
    expect(enlaceDeRed("youtube", "")).toBeNull();
    expect(enlaceDeRed("youtube", "   ")).toBeNull();
    expect(enlaceDeRed("youtube", null)).toBeNull();
    expect(enlaceDeRed("youtube", undefined)).toBeNull();
  });
});

describe("lo que llega de la base", () => {
  it("solo salen las redes configuradas", () => {
    const r = normalizarRedes({
      facebook: "https://facebook.com/coleffe",
      instagram: "",
      whatsapp: "51903375308",
    });
    expect(r).toEqual({
      facebook: "https://facebook.com/coleffe",
      whatsapp: "https://wa.me/51903375308",
    });
    expect(r.instagram).toBeUndefined();
  });

  it("una red con un valor peligroso se cae, y las demás siguen", () => {
    // Que una mal puesta no se lleve por delante a las otras cinco.
    const r = normalizarRedes({
      facebook: "javascript:alert(1)",
      instagram: "https://instagram.com/coleffe",
    });
    expect(r.facebook).toBeUndefined();
    expect(r.instagram).toBe("https://instagram.com/coleffe");
  });

  it("una respuesta vacía, nula o rara no rompe el pie", () => {
    expect(normalizarRedes({})).toEqual({});
    expect(normalizarRedes(null)).toEqual({});
    expect(normalizarRedes("no es un objeto")).toEqual({});
    expect(normalizarRedes({ facebook: 42 })).toEqual({});
  });

  it("no se cuela una clave que no sea de las seis", () => {
    // La función de base solo devuelve las `social_*`, pero el front no se fía:
    // lo que se pinta sale de la lista REDES, no de lo que llegue.
    const r = normalizarRedes({ payment_worker_secret: "https://evil.example" });
    expect(r).toEqual({});
  });
});

describe("las seis redes que se pidieron", () => {
  it("están todas y con su nombre", () => {
    expect([...REDES]).toEqual([
      "facebook", "instagram", "tiktok", "youtube", "linkedin", "whatsapp",
    ]);
    for (const red of REDES) expect(NOMBRE_RED[red]).toBeTruthy();
  });
});
