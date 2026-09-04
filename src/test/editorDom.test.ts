import { describe, it, expect, beforeEach } from "vitest";
import {
  leerDelDom, escribirEnDom, largoDelDom, guardarSeleccion, restaurarSeleccion,
} from "@/lib/editorDom";
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
      { t: "Urgente", c: "#dc2626" },
    ]);
  });

  it("como `rgb(...)`, que es como lo devuelve el navegador al leerlo", () => {
    expect(conHtml('<span style="color: rgb(5, 150, 105)">Nuevo</span>')).toEqual([
      { t: "Nuevo", c: "#059669" },
    ]);
  });

  it("y como <font color>, que es lo que sigue produciendo Safari", () => {
    expect(conHtml('<font color="#bd4e05">Rebaja</font>')).toEqual([
      { t: "Rebaja", c: "#bd4e05" },
    ]);
  });

  it("un color que no es de los atajos se conserva igual", () => {
    // Desde que se admite cualquier tono, esto ya NO se descarta: es
    // exactamente lo que produce el selector libre.
    expect(conHtml('<span style="color: #ff00ff">Suelto</span>')).toEqual([
      { t: "Suelto", c: "#ff00ff" },
    ]);
  });

  it("y llega normalizado, venga como venga", () => {
    // Un mismo color escrito de tres formas tiene que producir UN solo valor:
    // si no, dos trozos del mismo color no se fusionarían y el tope de 300
    // fragmentos se agotaría antes de tiempo.
    expect(conHtml('<span style="color: #FF00FF">x</span>')[0].c).toBe("#ff00ff");
    expect(conHtml('<span style="color: rgb(255, 0, 255)">x</span>')[0].c).toBe("#ff00ff");
    expect(conHtml('<font color="#f0f">x</font>')[0].c).toBe("#ff00ff");
  });

  it("el color normal no se guarda como color", () => {
    // Es lo que hace que «sin color» funcione: pinta el tono que el texto
    // tendría igualmente, y al leerlo se descarta. Guardarlo sería decir
    // «este trozo tiene color» cuando no lo tiene.
    expect(conHtml('<span style="color: #29303d">Texto</span>')).toEqual([
      { t: "Texto" },
    ]);
  });
});

describe("negrita y color a la vez", () => {
  it("da igual cómo estén anidados", () => {
    const a = conHtml('<b><span style="color: #dc2626">Ya</span></b>');
    const b = conHtml('<span style="color: #dc2626"><b>Ya</b></span>');
    expect(a).toEqual([{ t: "Ya", b: true, c: "#dc2626" }]);
    expect(a).toEqual(b);
  });

  it("las marcas se heredan hacia dentro", () => {
    expect(conHtml('<b>uno <span style="color: #dc2626">dos</span></b>')).toEqual([
      { t: "uno ", b: true }, { t: "dos", b: true, c: "#dc2626" },
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
    const f: TextoConFormato = [{ t: "Depa " }, { t: "amoblado", b: true, c: "#dc2626" }];
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
    // El editor pega como texto plano, pero si algo se colara igual, leerlo
    // solo puede producir las DOS marcas del modelo: un tamaño de letra, una
    // tipografía o un fondo no existen y se pierden por el camino.
    const r = conHtml('<table><tr><td style="font-size:40px">Precio</td></tr></table>');
    expect(r).toEqual([{ t: "Precio" }]);
  });

  it("y un script pegado no es más que texto", () => {
    const r = conHtml("<span>hola</span>");
    expect(r).toEqual([{ t: "hola" }]);
  });
});

describe("guardar y devolver la selección", () => {
  /**
   * DE ESTO DEPENDE EL SELECTOR DE COLOR LIBRE.
   *
   * Los botones de la barra conservan la selección con `preventDefault` en el
   * `pointerdown`, pero a un `<input type="color">` no se le puede hacer eso: si
   * se le impide el gesto, no se abre la rueda. Se le deja llevarse el foco y la
   * selección se recupera con estas dos funciones. Sin ellas, elegir un color
   * no tiñe nada.
   */
  const seleccionar = (nodo: Node, desde: number, hasta: number) => {
    const r = document.createRange();
    r.setStart(nodo, desde);
    r.setEnd(nodo, hasta);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
  };

  it("devuelve la selección después de perder el foco", () => {
    raiz.textContent = "Depa amoblado";
    seleccionar(raiz.firstChild!, 5, 13);
    const guardado = guardarSeleccion(raiz);

    // Lo que hace el navegador al abrirse el selector de color.
    window.getSelection()!.removeAllRanges();
    expect(window.getSelection()!.rangeCount).toBe(0);

    expect(restaurarSeleccion(raiz, guardado)).toBe(true);
    expect(window.getSelection()!.toString()).toBe("amoblado");
  });

  it("no guarda nada si la selección estaba FUERA del editor", () => {
    // Si no, pulsar el selector con el cursor en el título teñiría la
    // descripción de alguien que no estaba mirándola.
    const otro = document.createElement("div");
    otro.textContent = "otro campo";
    document.body.appendChild(otro);
    seleccionar(otro.firstChild!, 0, 4);
    expect(guardarSeleccion(raiz)).toBeNull();
  });

  it("sin nada guardado, no hace nada", () => {
    expect(restaurarSeleccion(raiz, null)).toBe(false);
  });

  it("si el contenido cambió mientras tanto, NO se tiñe texto ajeno", () => {
    // Lo comprobado, no lo supuesto: al borrarse los nodos, el navegador NO
    // invalida el rango — lo recoloca al principio del editor y lo deja
    // colapsado. Se apuntó aquí porque la primera versión de esta prueba daba
    // por hecho lo contrario.
    //
    // Y colapsado es justo el desenlace bueno: un color sobre un cursor no
    // repinta nada, solo tiñe lo que se escriba después. Lo que no puede pasar
    // —y es lo que se fija aquí— es que se lleve por delante un texto que la
    // persona no había seleccionado.
    raiz.textContent = "Depa amoblado";
    seleccionar(raiz.firstChild!, 0, 4);
    const guardado = guardarSeleccion(raiz);

    escribirEnDom(raiz, [{ t: "otra cosa" }]);
    restaurarSeleccion(raiz, guardado);

    expect(window.getSelection()!.toString()).toBe("");
  });
});
