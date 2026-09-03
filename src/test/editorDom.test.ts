import { describe, it, expect, beforeEach } from "vitest";
import { leerDelDom, escribirEnDom, largoDelDom } from "@/lib/editorDom";
import { aTextoPlano, type TextoConFormato } from "@/lib/textoConFormato";

/**
 * Leer lo que el navegador deja en el editor.
 *
 * ESTA ES LA PARTE DELICADA. El editor deja escribir al navegador y solo LEE —
 * es lo que hace que el teclado, el cursor y la autocorrección del móvil se
 * comporten como en cualquier campo de texto. El precio es que cada navegador
 * deja el HTML a su manera al dar formato:
 *
 *   · Chrome con `styleWithCSS`  →  <span style="font-weight: bold">
 *   · sin `styleWithCSS`         →  <b> y <font color="...">
 *   · Safari                     →  suele preferir <font>
 *   · y todos anidan en el orden que les da la gana
 *
 * Todas esas formas significan lo mismo y aquí se comprueba que se entienden.
 */

let raiz: HTMLElement;
beforeEach(() => {
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
});

/** Monta el contenido del editor como lo dejaría el navegador. */
const conHtml = (html: string) => { raiz.innerHTML = html; return leerDelDom(raiz); };

describe("las formas en que llega la negrita", () => {
  it("con <b>, que es lo que produce el navegador sin `styleWithCSS`", () => {
    expect(conHtml("Depa <b>amoblado</b>")).toEqual([
      { t: "Depa " }, { t: "amoblado", b: true },
    ]);
  });

  it("con <strong>", () => {
    expect(conHtml("<strong>Oferta</strong>")).toEqual([{ t: "Oferta", b: true }]);
  });

  it("con un estilo, que es lo que produce con `styleWithCSS`", () => {
    expect(conHtml('<span style="font-weight: bold">Oferta</span>')).toEqual([
      { t: "Oferta", b: true },
    ]);
  });

  it("y con un peso numérico, que es como lo devuelve Chrome", () => {
    expect(conHtml('<span style="font-weight: 700">Oferta</span>')[0].b).toBe(true);
    // 400 es el normal: no es negrita por mucho que traiga la propiedad.
    expect(conHtml('<span style="font-weight: 400">Normal</span>')[0].b).toBeUndefined();
  });
});

describe("las formas en que llega el color", () => {
  it("como estilo en línea", () => {
    expect(conHtml('<span style="color: #dc2626">Urgente</span>')).toEqual([
      { t: "Urgente", c: "rojo" },
    ]);
  });

  it("como `rgb(...)`, que es como lo devuelve el navegador al leerlo", () => {
    expect(conHtml('<span style="color: rgb(5, 150, 105)">Nuevo</span>')).toEqual([
      { t: "Nuevo", c: "verde" },
    ]);
  });

  it("y como <font color>, que es lo que sigue produciendo Safari", () => {
    expect(conHtml('<font color="#bd4e05">Rebaja</font>')).toEqual([
      { t: "Rebaja", c: "naranja" },
    ]);
  });

  it("un color que NO es de la paleta se descarta", () => {
    // Pasa al pegar de otra web. Antes que colar un tono que la base rechazaría
    // —y que nadie eligió—, se queda en el color normal.
    expect(conHtml('<span style="color: #ff00ff">Pegado</span>')).toEqual([
      { t: "Pegado" },
    ]);
  });

  it("el color normal no se guarda como color", () => {
    // Elegir «Normal» pinta el tono del texto de siempre; guardarlo sería
    // decir «este trozo tiene color» cuando no lo tiene.
    expect(conHtml('<span style="color: #29303d">Texto</span>')).toEqual([
      { t: "Texto" },
    ]);
  });
});

describe("negrita y color a la vez", () => {
  it("da igual cómo estén anidados", () => {
    const a = conHtml('<b><span style="color: #dc2626">Ya</span></b>');
    const b = conHtml('<span style="color: #dc2626"><b>Ya</b></span>');
    expect(a).toEqual([{ t: "Ya", b: true, c: "rojo" }]);
    expect(a).toEqual(b);
  });

  it("las marcas se heredan hacia dentro", () => {
    expect(conHtml('<b>uno <span style="color: #dc2626">dos</span></b>')).toEqual([
      { t: "uno ", b: true }, { t: "dos", b: true, c: "rojo" },
    ]);
  });
});

describe("los saltos de línea", () => {
  it("un <br> es un salto", () => {
    expect(aTextoPlano(conHtml("uno<br>dos"))).toBe("uno\ndos");
  });

  it("y los bloques que crea el navegador al pulsar Enter también", () => {
    expect(aTextoPlano(conHtml("<div>uno</div><div>dos</div>"))).toBe("uno\ndos");
  });

  it("pero el primer bloque no añade un salto de más", () => {
    // Si lo añadiera, cada descripción empezaría con una línea en blanco.
    expect(aTextoPlano(conHtml("<div>uno</div>"))).toBe("uno");
  });
});

describe("el texto sobrevive intacto", () => {
  it("los trozos contiguos se juntan", () => {
    const r = conHtml("<span>a</span><span>b</span><span>c</span>");
    expect(r).toEqual([{ t: "abc" }]);
  });

  it("nada de lo que se lee inventa ni pierde caracteres", () => {
    const r = conHtml('Hola <b>mundo</b>, <font color="#059669">qué tal</font>');
    expect(aTextoPlano(r)).toBe("Hola mundo, qué tal");
  });

  it("cuenta lo que la persona escribió, no las etiquetas", () => {
    // Es lo que hace que el contador de 2000 caracteres siga siendo honesto.
    raiz.innerHTML = '<b>cinco</b>';
    expect(largoDelDom(raiz)).toBe(5);
  });
});

describe("volcar el modelo en el editor", () => {
  it("pinta el formato de vuelta", () => {
    const f: TextoConFormato = [{ t: "Depa " }, { t: "amoblado", b: true, c: "rojo" }];
    escribirEnDom(raiz, f);
    expect(raiz.textContent).toBe("Depa amoblado");
    // Y lo que se pinta se vuelve a leer igual: es la garantía de que editar un
    // aviso guardado no le cambia el formato.
    expect(leerDelDom(raiz)).toEqual(f);
  });

  it("los saltos de línea se pintan como <br>", () => {
    // Dentro de un `contenteditable`, un "\n" suelto no se ve.
    escribirEnDom(raiz, [{ t: "uno\ndos" }]);
    expect(raiz.querySelectorAll("br")).toHaveLength(1);
    expect(aTextoPlano(leerDelDom(raiz))).toBe("uno\ndos");
  });

  it("NO usa innerHTML: una descripción con una etiqueta dentro es TEXTO", () => {
    // Por aquí pasa texto de usuarios. Con `innerHTML`, una descripción que
    // dijera "<img onerror=...>" se convertiría en un elemento de verdad.
    escribirEnDom(raiz, [{ t: '<img src=x onerror="alert(1)">', b: true }]);
    expect(raiz.querySelector("img")).toBeNull();
    expect(raiz.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it("vaciar deja el editor limpio", () => {
    escribirEnDom(raiz, [{ t: "algo" }]);
    escribirEnDom(raiz, []);
    expect(raiz.textContent).toBe("");
  });
});

describe("lo que se pega de fuera", () => {
  it("una tabla entera de Word se queda solo en su texto", () => {
    // El editor pega como texto plano, pero si algo se colara igual, leerlo no
    // puede producir marcas que no existen en la paleta.
    const r = conHtml('<table><tr><td style="font-size:40px">Precio</td></tr></table>');
    expect(r).toEqual([{ t: "Precio" }]);
  });

  it("y un script pegado no es más que texto", () => {
    const r = conHtml("<span>hola</span>");
    expect(r).toEqual([{ t: "hola" }]);
  });
});
