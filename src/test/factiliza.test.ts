// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  construirComprobante, leerRespuesta, montoEnLetras, fechaEmisionPeru,
  ComprobanteInvalido, type DatosDelComprobante,
} from "../../supabase/functions/_shared/factiliza.ts";
import {
  DEFAULT_SETTINGS, priceForDuration, extrasTotal, splitIgv,
} from "../../supabase/functions/_shared/pricing.ts";

/**
 * El comprobante que se le manda a Factiliza para que SUNAT lo acepte.
 *
 * Es el módulo más probado del proyecto a propósito: un error aquí no se ve en
 * pantalla, se ve semanas después en forma de comprobante rechazado, correlativo
 * quemado y una incidencia que alguien tiene que resolver a mano con el contador.
 * Y a diferencia de casi todo lo demás, no se puede "arreglar y volver a
 * intentar": un documento fiscal emitido mal ya está emitido.
 */

const BASE: DatosDelComprobante = {
  tipo: "boleta",
  serie: "B001",
  correlativo: 82,
  fechaEmision: new Date("2026-08-11T15:30:00Z"),
  emisorRuc: "20607086215",
  clienteDocTipo: "dni",
  clienteDocNumero: "44443333",
  clienteNombre: "JUAN PÉREZ ÑOPO",
  descripcion: "Compra de saldo: 2 avisos · 7 días",
  total: 118,
  subtotal: 100,
  igv: 18,
};

const construir = (extra: Partial<DatosDelComprobante> = {}) =>
  construirComprobante({ ...BASE, ...extra });

describe("el cuadre de importes", () => {
  it("gravadas + IGV es exactamente el total", () => {
    const c = construir() as Record<string, number>;
    expect(c.monto_Oper_Gravadas + c.monto_Igv).toBeCloseTo(c.monto_Imp_Venta, 10);
  });

  it("sub_Total va CON IGV y valor_Venta SIN él", () => {
    // No es un descuido de su API: está así en su documentación, y confundirlos
    // es un rechazo seguro.
    const c = construir() as Record<string, number>;
    expect(c.valor_Venta).toBe(100);
    expect(c.sub_Total).toBe(118);
    expect(c.monto_Imp_Venta).toBe(118);
  });

  it("si el subtotal guardado no cuadra, se recalcula en vez de mandarlo mal", () => {
    // Un céntimo de descuadre —por un redondeo viejo, por una edición a mano—
    // no puede acabar en SUNAT.
    const c = construir({ total: 118, subtotal: 99.99, igv: 18 }) as Record<string, number>;
    expect(c.monto_Oper_Gravadas + c.monto_Igv).toBe(118);
  });

  it("el detalle de la línea cuadra con las cabeceras", () => {
    const c = construir() as Record<string, unknown>;
    const linea = (c.detalle as Array<Record<string, number>>)[0];
    expect(linea.monto_Valor_Venta).toBe(c.valor_Venta);
    expect(linea.igv).toBe(c.monto_Igv);
    expect(linea.monto_Precio_Unitario).toBe(c.monto_Imp_Venta);
    expect(linea.monto_Base_Igv + linea.igv).toBeCloseTo(linea.monto_Precio_Unitario, 10);
  });

  it("la forma de pago suma el total", () => {
    const c = construir() as Record<string, unknown>;
    expect((c.forma_pago as Array<Record<string, number>>)[0].monto).toBe(118);
  });
});

/**
 * El caso que de verdad importa: TODOS los precios que la plataforma puede
 * generar. No vale probar con 118 y dar por hecho el resto — el redondeo del
 * IGV falla en importes concretos, no en general.
 */
describe("cuadre para todos los precios que la plataforma puede cobrar", () => {
  const cantidades = [1, 2, 3, 5, 10, 25];
  const duraciones = [3, 7, 15, 30] as const;
  const extras = [
    {}, { destacado: 1 }, { urgente: 1 }, { confidencial: 1 },
    { destacado: 1, urgente: 1 }, { destacado: 1, urgente: 1, confidencial: 1 },
    // Era `imagenAdicional`, que no es una clave de la tarifa: ese combo no
    // sumaba nada y el `as never` de abajo lo tapaba. La clave real es img500.
    { img500: 3 },
  ];

  const totales = new Set<number>();
  for (const n of cantidades) {
    for (const d of duraciones) {
      for (const e of extras) {
        // Los adicionales se cobran por día, así que la duración entra aquí.
        const t = Math.round((priceForDuration(n, d, DEFAULT_SETTINGS)
          + extrasTotal(e as never, d, DEFAULT_SETTINGS)) * 100) / 100;
        if (t > 0) totales.add(t);
      }
    }
  }

  it("hay una matriz de precios que valga la pena recorrer", () => {
    expect(totales.size).toBeGreaterThan(20);
  });

  it.each([...totales])("S/ %s cuadra al céntimo", (total) => {
    const { subtotal, igv } = splitIgv(total);
    const c = construir({ total, subtotal, igv }) as Record<string, number>;
    // La suma tiene que dar el total EXACTO, no aproximado: SUNAT compara
    // céntimo a céntimo.
    expect(Math.round((c.monto_Oper_Gravadas + c.monto_Igv) * 100))
      .toBe(Math.round(total * 100));
    expect(c.monto_Imp_Venta).toBe(Math.round(total * 100) / 100);
  });
});

describe("la fecha de emisión", () => {
  it("va en hora de Perú, con el desplazamiento explícito", () => {
    expect(fechaEmisionPeru(new Date("2026-08-11T15:30:00Z"))).toBe("2026-08-11T10:30:00-05:00");
  });

  it("una compra de la noche NO se emite con la fecha del día siguiente", () => {
    // El servidor corre en UTC: las 20:00 de Lima son las 01:00 del día
    // siguiente en UTC. Emitir con esa fecha es un comprobante fuera de fecha.
    expect(fechaEmisionPeru(new Date("2026-08-12T01:30:00Z"))).toBe("2026-08-11T20:30:00-05:00");
  });

  it("no depende de la zona horaria de la máquina", () => {
    // `toISOString` sí dependería; por eso se construye a mano.
    const antes = process.env.TZ;
    const resultados = ["UTC", "America/Lima", "Asia/Tokyo", "America/New_York"].map((tz) => {
      process.env.TZ = tz;
      return fechaEmisionPeru(new Date("2026-08-11T15:30:00Z"));
    });
    process.env.TZ = antes;
    expect(new Set(resultados).size).toBe(1);
    expect(resultados[0]).toBe("2026-08-11T10:30:00-05:00");
  });

  it("la fecha de pago del contado es la misma que la de emisión", () => {
    const c = construir() as Record<string, unknown>;
    expect((c.forma_pago as Array<Record<string, string>>)[0].fecha_Pago).toBe(c.fecha_Emision);
  });
});

describe("el importe en letras (leyenda 1000)", () => {
  const casos: Array<[number, string]> = [
    [118, "SON CIENTO DIECIOCHO CON 00/100 SOLES"],
    [118.5, "SON CIENTO DIECIOCHO CON 50/100 SOLES"],
    [1, "SON UNO CON 00/100 SOLES"],
    [21, "SON VEINTIUNO CON 00/100 SOLES"],
    [30, "SON TREINTA CON 00/100 SOLES"],
    [31, "SON TREINTA Y UNO CON 00/100 SOLES"],
    [100, "SON CIEN CON 00/100 SOLES"],
    [101, "SON CIENTO UNO CON 00/100 SOLES"],
    [200, "SON DOSCIENTOS CON 00/100 SOLES"],
    [1000, "SON MIL CON 00/100 SOLES"],
    [1001, "SON MIL UNO CON 00/100 SOLES"],
    [2500, "SON DOS MIL QUINIENTOS CON 00/100 SOLES"],
    [1000000, "SON UN MILLÓN CON 00/100 SOLES"],
    [0.9, "SON CERO CON 90/100 SOLES"],
  ];

  it.each(casos)("%s → %s", (monto, esperado) => {
    expect(montoEnLetras(monto)).toBe(esperado);
  });

  it("los céntimos van siempre con dos cifras", () => {
    expect(montoEnLetras(5.05)).toContain("CON 05/100");
    expect(montoEnLetras(5.5)).toContain("CON 50/100");
  });

  it("el redondeo del céntimo no se cuela como 100/100", () => {
    expect(montoEnLetras(9.999)).toBe("SON DIEZ CON 00/100 SOLES");
  });

  it("acompaña a la moneda", () => {
    expect(montoEnLetras(10, "USD")).toBe("SON DIEZ CON 00/100 DÓLARES AMERICANOS");
  });

  it("va en el comprobante con su código", () => {
    const c = construir() as Record<string, unknown>;
    expect((c.legend as Array<Record<string, string>>)[0]).toEqual({
      legend_Code: "1000",
      legend_Value: "SON CIENTO DIECIOCHO CON 00/100 SOLES",
    });
  });
});

describe("coherencia: se rechaza aquí antes de gastar un envío", () => {
  it("una factura exige RUC", () => {
    expect(() => construir({ tipo: "factura", serie: "F001" }))
      .toThrow(ComprobanteInvalido);
  });

  it("con RUC corresponde factura, no boleta", () => {
    expect(() => construir({ clienteDocTipo: "ruc", clienteDocNumero: "20552103816" }))
      .toThrow(/factura/i);
  });

  it("una factura con RUC sí se construye", () => {
    const c = construir({
      tipo: "factura", serie: "F001",
      clienteDocTipo: "ruc", clienteDocNumero: "20552103816",
      clienteNombre: "AGROLIGHT PERU S.A.C.",
    }) as Record<string, string>;
    expect(c.tipo_Doc).toBe("01");
    expect(c.cliente_Tipo_Doc).toBe("6");
  });

  it("el DNI tiene 8 dígitos y el RUC 11", () => {
    expect(() => construir({ clienteDocNumero: "4444333" })).toThrow(/8 d/);
    expect(() => construir({
      tipo: "factura", serie: "F001", clienteDocTipo: "ruc", clienteDocNumero: "2055210381",
    })).toThrow(/11 d/);
  });

  it("sin RUC del emisor no se emite nada", () => {
    expect(() => construir({ emisorRuc: "" })).toThrow(/emisor/i);
  });

  it("un importe de cero no es un comprobante", () => {
    expect(() => construir({ total: 0, subtotal: 0, igv: 0 })).toThrow(/mayor que cero/i);
  });

  it("sin documento del cliente tampoco", () => {
    expect(() => construir({ clienteDocNumero: null })).toThrow(/documento/i);
  });
});

/**
 * Leer la respuesta. Es donde más fácil se cuela un error, porque Factiliza
 * contesta con HTTP 200 tanto si SUNAT acepta como si rechaza.
 */
describe("interpretar lo que contesta Factiliza", () => {
  const aceptado = {
    status: 200, success: true, message: "El documento fue registrado",
    data: {
      hash: "AeOqQVd8d5kfPS+CmeCMF+NNMpI=",
      sunatResponse: {
        success: true, cdrZip: "UEsDBBQ…",
        cdrResponse: { id: "B001-000082", code: "0", description: "La Boleta numero B001-000082, ha sido aceptada", notes: [] },
      },
    },
  };

  it("aceptado se lee como aceptado, con su hash y su CDR", () => {
    const r = leerRespuesta(200, aceptado);
    expect(r.desenlace).toBe("aceptado");
    expect(r.hash).toBe("AeOqQVd8d5kfPS+CmeCMF+NNMpI=");
    expect(r.codigo).toBe("0");
    expect(r.cdrZip).toBe("UEsDBBQ…");
    expect(r.reintentable).toBe(false);
  });

  it("🔴 HTTP 200 con success:false es RECHAZADO, no aceptado", () => {
    // El caso que se cuela si se mira el código HTTP. Un rechazo dado por bueno
    // se le manda al cliente como comprobante válido y nadie se entera.
    const r = leerRespuesta(200, {
      status: 400, success: false, message: "El documento ha sido rechazado",
    });
    expect(r.desenlace).toBe("rechazado");
    expect(r.mensaje).toMatch(/rechazado/i);
  });

  it("un rechazo NO se reintenta solo", () => {
    // Reenviarlo daría el mismo resultado y quemaría otro correlativo.
    const r = leerRespuesta(200, { success: false, message: "RUC inválido" });
    expect(r.reintentable).toBe(false);
  });

  it("aceptado con notas es 'observado': vale, pero hay que mirarlo", () => {
    const r = leerRespuesta(200, {
      ...aceptado,
      data: {
        ...aceptado.data,
        sunatResponse: {
          ...aceptado.data.sunatResponse,
          cdrResponse: { ...aceptado.data.sunatResponse.cdrResponse, notes: ["4267 - El dato ingresado no cumple con el formato"] },
        },
      },
    });
    expect(r.desenlace).toBe("observado");
  });

  it("un 500 sí se reintenta: no es culpa del documento", () => {
    const r = leerRespuesta(500, { success: false, message: "Internal error" });
    expect(r.desenlace).toBe("error");
    expect(r.reintentable).toBe(true);
  });

  it("un token inválido se trata como error de configuración, reintentable", () => {
    // Reintentar no arregla un token malo, pero cuando alguien lo corrija el
    // comprobante debe recuperarse solo en vez de quedar muerto.
    const r = leerRespuesta(401, { message: "Unauthorized" });
    expect(r.desenlace).toBe("error");
    expect(r.reintentable).toBe(true);
  });

  // Las dos respuestas LITERALES de su documentación (factiliza.gitbook.io).
  // Copiadas tal cual, para que nuestro lector quede atado a su contrato y no a
  // lo que yo supusiera que devuelven.
  describe("las respuestas de su documentación, copiadas literalmente", () => {
    const ACEPTADO_DOC = {
      status: 200,
      success: true,
      message: "DEMO - El documento fue registrado en el sistema y se encuentra declarado correctamente validado en la sunat!",
      data: {
        hash: "AeOqQVd8d5kfPS+CmeCMF+NNMpI=",
        sunatResponse: {
          success: true,
          cdrZip: "UEsDBBQAAgAIALpqtlgAAAAAAgAAAAAAAAAGAAAAZHVtbXkvAwBQSwME",
          cdrResponse: {
            id: "BV01-000022",
            code: "0",
            description: "La Boleta numero BV01-000022, ha sido aceptada",
            notes: [],
          },
        },
      },
    };

    const RECHAZADO_DOC = {
      status: 400,
      success: false,
      message: "DEMO - El documento ah sido rechzado, por favor revise los datos para mas detalle",
    };

    it("el ejemplo de ACEPTADO se lee como aceptado, con hash, CDR y zip", () => {
      const r = leerRespuesta(200, ACEPTADO_DOC);
      expect(r.desenlace).toBe("aceptado");
      expect(r.hash).toBe("AeOqQVd8d5kfPS+CmeCMF+NNMpI=");
      expect(r.codigo).toBe("0");
      expect(r.mensaje).toContain("ha sido aceptada");
      expect(r.cdrZip).toBeTruthy();
      expect(r.reintentable).toBe(false);
    });

    it("el ejemplo de RECHAZADO llega con HTTP 400 y NO se reintenta", () => {
      // Lo que importa aquí: un rechazo por datos viaja con 400, que es el
      // código típico de un error de red pasajero. Si se tratara como tal, el
      // barrido reenviaría el mismo documento malo una y otra vez, quemando un
      // correlativo en cada intento.
      const r = leerRespuesta(400, RECHAZADO_DOC);
      expect(r.desenlace).toBe("rechazado");
      expect(r.reintentable).toBe(false);
      expect(r.mensaje).toContain("rechzado");
    });

    it("da igual que el rechazo llegue con 200 o con 400: es rechazo", () => {
      // Su documentación enseña 400, pero el cuerpo lleva su propio `status`.
      // Se decide por `success`, no por el HTTP, para no depender de cuál manden.
      for (const http of [200, 400, 422]) {
        expect(leerRespuesta(http, RECHAZADO_DOC).desenlace, `HTTP ${http}`).toBe("rechazado");
      }
    });
  });

  it("una respuesta ilegible no se da por buena", () => {
    for (const cuerpo of [null, "<html>502 Bad Gateway</html>", undefined]) {
      const r = leerRespuesta(502, cuerpo);
      expect(r.desenlace).toBe("error");
      expect(r.reintentable).toBe(true);
    }
  });

  it("aceptado por Factiliza pero sin CDR todavía no se marca observado", () => {
    const r = leerRespuesta(200, { success: true, message: "Registrado", data: { hash: "abc" } });
    expect(r.desenlace).toBe("aceptado");
    expect(r.cdr).toBeNull();
  });
});

/**
 * Consultar un comprobante ya enviado. Los tres endpoints de su API que reciben
 * esto (/invoice/cdr, /invoice/pdf, /invoice/xml) piden lo mismo.
 *
 * Es lo que evita el peor error posible: emitir dos veces el mismo documento
 * porque un envío se cortó después de llegar a Factiliza pero antes de que
 * guardáramos su respuesta.
 */
describe("consulta de un comprobante por serie y correlativo", () => {
  it("lleva exactamente los cuatro campos que pide su API", async () => {
    const { consultaDeComprobante } = await import("../../supabase/functions/_shared/factiliza.ts");
    expect(consultaDeComprobante("20616009061", "boleta", "B001", 82)).toEqual({
      empresa_Ruc: "20616009061",
      tipo_Doc: "03",
      serie: "B001",
      correlativo: "82",
    });
  });

  it("una factura va con su tipo, no con el de boleta", async () => {
    const { consultaDeComprobante } = await import("../../supabase/functions/_shared/factiliza.ts");
    expect(consultaDeComprobante("20616009061", "factura", "F001", 5).tipo_Doc).toBe("01");
  });

  it("el correlativo viaja como texto, igual que al emitir", async () => {
    const { consultaDeComprobante } = await import("../../supabase/functions/_shared/factiliza.ts");
    expect(consultaDeComprobante("20616009061", "boleta", "B001", 7).correlativo).toBe("7");
  });
});

describe("campos que exige su API", () => {
  it("lleva el tipo de operación, el estado y el modo", () => {
    const c = construir() as Record<string, unknown>;
    expect(c.tipo_Operacion).toBe("0101");
    expect(c.estado_Documento).toBe("0");
    expect(c.manual).toBe(false);
  });

  it("la unidad y la afectación al IGV son las del catálogo", () => {
    const linea = (construir() as Record<string, unknown>).detalle as Array<Record<string, unknown>>;
    expect(linea[0].unidad).toBe("NIU");
    expect(linea[0].tip_Afe_Igv).toBe("10");
    expect(linea[0].factor_Icbper).toBe(0);
  });

  it("el correlativo viaja como texto, que es lo que espera", () => {
    expect((construir({ correlativo: 82 }) as Record<string, unknown>).correlativo).toBe("82");
  });

  it("id_Base_Dato solo se manda si lo hay (es opcional)", () => {
    expect((construir() as Record<string, unknown>).id_Base_Dato).toBeUndefined();
    expect((construir({ idBaseDato: "abc-123" }) as Record<string, unknown>).id_Base_Dato).toBe("abc-123");
  });

  it("sin dirección del cliente manda vacío, no se la inventa", () => {
    expect((construir() as Record<string, unknown>).cliente_Direccion).toBe("");
  });
});
