/**
 * QUÉ DICE Y ADÓNDE LLEVA CADA NOTIFICACIÓN. Un solo sitio.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA QUE RESUELVE
 *
 * La misma notificación viaja por tres canales y cada uno tenía su propio
 * `switch`, escrito en un momento distinto y por separado:
 *
 *     campana  →  src/lib/notifications.ts        15 tipos
 *     correo   →  supabase/functions/send-email    9 tipos
 *     push     →  supabase/functions/send-push     5 tipos
 *
 * Lo que no estaba en la lista de cada uno caía en su `default`. Así que un
 * aviso a punto de vencer —el que más importa, porque es el que hace perder
 * dinero al anunciante— llegaba así:
 *
 *     campana  «Mi aviso» está por vencer. Lleva 5 días publicado y le quedan…
 *     correo   Tu aviso «Mi aviso» está por vencer. Te quedan 2 días…
 *     push     Tienes una nueva notificación          ← y abría la ficha pública
 *
 * Y la ficha pública es justo la que NO sirve: sale de `listing_cards`, que solo
 * trae los activos. Basta leer el aviso unas horas tarde para que el enlace no
 * lleve a ninguna parte. El correo ya lo había corregido por su cuenta; el push
 * no se enteró.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CÓMO QUEDA
 *
 * Cada tipo dice UNA cosa y lleva a UN sitio, aquí. Los canales no reescriben
 * nada: el correo añade el enlace en palabras (no hay dónde pulsar en un texto)
 * y el push adjunta la ruta para que el toque navegue. Nada más.
 *
 * Las dos Edge Functions son Deno y no ven este archivo, así que llevan una
 * COPIA. `src/test/textosDeNotificacion.test.ts` compara las tres y falla si se
 * separan — que es exactamente lo que pasó y hay que impedir que vuelva a pasar.
 */
import { enPalabras } from "@/lib/duracion";

export type Rol = string;

/** Las dos ramas del panel. Fuera de ellas, un aviso de personal no tiene destino. */
const esStaff = (role: Rol) => role === "admin" || role === "superadmin";

/**
 * El texto del aviso por vencer, que es el que pidió estandarizar el cliente.
 *
 * ORDEN DELIBERADO: primero lo que urge (cuánto queda), después el contexto
 * (cuánto lleva) y al final qué hacer. En una notificación del móvil se leen
 * las primeras palabras y poco más, así que "vence en 20 horas" tiene que ir
 * delante de "lleva 5 días publicado".
 */
export function textoDeVencimiento(p: Record<string, unknown>): string {
  const titulo = String(p.listing_title ?? "Tu aviso");
  // `Number(null)` y `Number("")` valen CERO, no NaN: comprobar solo que sea
  // finito dejaba pasar la ausencia de dato y la alerta acababa diciendo "vence
  // en menos de una hora" de un aviso recién publicado.
  const cifra = (v: unknown) =>
    v === null || v === undefined || v === "" ? Number.NaN : Number(v);
  const restantes = cifra(p.horas_restantes);
  const transcurridas = cifra(p.horas_transcurridas);

  const cuando = Number.isFinite(restantes)
    ? `vence en ${enPalabras(restantes)}`
    // Los avisos guardados antes de la 0133 no traen las horas; se leen con lo
    // que sí tienen, que son días enteros.
    : (() => {
        const dias = Number(p.dias);
        return Number.isFinite(dias) && dias > 0
          ? `vence en ${dias} ${dias === 1 ? "día" : "días"}`
          : "está por vencer";
      })();

  const lleva = Number.isFinite(transcurridas)
    ? ` Lleva ${enPalabras(transcurridas)} publicado.`
    : "";

  // "Cuando venza" y NO "renuévalo ahora": desde el 2026-09-02 la única forma
  // de volver a anunciar es "Republicar", que crea un aviso NUEVO. Si esto
  // invitara a actuar antes de que venza, el anunciante acabaría con el mismo
  // aviso publicado dos veces a la vez, pagando dos planes. Renovar —que sí
  // servía para actuar antes— está oculto por decisión del cliente.
  return `«${titulo}» ${cuando}.${lleva} Cuando venza, vuelve a publicarlo desde Mis avisos.`;
}

/**
 * El cuerpo de la notificación, igual en la campana, el correo y el push.
 *
 * Sin enlaces ni rutas: eso lo pone cada canal a su manera (ver `rutaDeNotificacion`).
 */
export function cuerpoDeNotificacion(
  type: string,
  payload: Record<string, unknown> | null | undefined,
  titulo?: string | null,
): string {
  const p = payload || {};
  const aviso = String(p.listing_title ?? "Tu aviso");

  switch (type) {
    case "admin_message":
      return (p.body as string) || titulo || "Mensaje del equipo";

    case "listing_expiring":
      return textoDeVencimiento(p);

    case "saved_search_match": {
      const count = Number(p.count ?? 0);
      const name = (p.name as string) || "tu búsqueda";
      return `${count} ${count === 1 ? "nuevo aviso" : "nuevos avisos"} para «${name}»`;
    }

    case "new_message":
      return (p.preview as string) ? `Nuevo mensaje: «${p.preview}»` : "Tienes un nuevo mensaje";

    case "application_status": {
      const map: Record<string, string> = {
        pending: "Pendiente", reviewed: "En revisión", interview: "En entrevista",
        accepted: "Aceptada", rejected: "Rechazada",
      };
      const st = map[(p.status as string)] ?? (p.status as string);
      return `Tu postulación cambió a: ${st}`;
    }

    case "new_review":
      return `Recibiste una nueva reseña (${p.rating ?? "—"}★)`;

    case "new_application":
      return `Nueva postulación en «${aviso}»`;

    case "listing_disabled": {
      const reason = (p.reason as string) || "";
      return reason
        ? `«${aviso}» fue deshabilitado: ${reason}`
        : `«${aviso}» fue deshabilitado por moderación`;
    }

    case "listing_enabled":
      return `«${aviso}» volvió a estar visible`;

    case "complaint_new": {
      // Se basta a sí mismo: lleva el código y el nombre para poder buscar el
      // correo o llamar al consumidor sin depender de ninguna pantalla.
      const resumen = (p.resumen as string) || "";
      if (resumen) return `${resumen}. Tienes 30 días para responderlo.`;
      const clase = p.kind === "queja" ? "queja" : "reclamo";
      return `Entró un ${clase} nuevo en el Libro de Reclamaciones.`;
    }

    case "career_new": {
      // Lleva el puesto y el nombre porque es lo que decide si esto se mira
      // ahora o el lunes: no es lo mismo un electricista que un contador.
      const nombre = (p.nombre as string) || "";
      const puesto = (p.puesto as string) || "";
      if (nombre && puesto) return `${nombre} postuló al puesto de ${puesto}.`;
      if (nombre) return `${nombre} envió una postulación de trabajo.`;
      return "Llegó una postulación nueva desde «Trabaje con nosotros».";
    }

    case "moderation_warning": {
      const reason = (p.reason as string) || "";
      const note = (p.note as string) || "";
      const base = reason ? `Advertencia por: ${reason}` : "Recibiste una advertencia de moderación";
      return note ? `${base}. ${note}` : base;
    }

    case "invoice_voided": {
      // Lo que el usuario nota es que le baja el saldo. Eso primero; el papeleo
      // después.
      const numero = (p.number as string) || "una de tus compras";
      const retirados = Number(p.credits ?? 0);
      const motivo = (p.reason as string) || "";
      const base = retirados > 0
        ? `Se anuló ${numero} y se retiraron ${retirados} créditos de tu saldo`
        : `Se anuló ${numero}`;
      return motivo ? `${base}. Motivo: ${motivo}` : `${base}.`;
    }

    case "manual_payment_approved": {
      const publicado = p.published === true;
      const proposito = String(p.purpose ?? "");
      if (proposito === "publish") {
        return publicado
          ? "Confirmamos tu pago y tu aviso ya está publicado."
          : "Confirmamos tu pago y se acreditó tu saldo. Tu aviso está a un paso de publicarse.";
      }
      if (proposito === "renew") {
        return publicado
          ? "Confirmamos tu pago y tu aviso ya está renovado."
          : "Confirmamos tu pago y se acreditó tu saldo.";
      }
      const monto = Number(p.monto ?? 0);
      return monto > 0
        ? `Confirmamos tu pago: se acreditaron S/ ${monto.toFixed(2)} a tu saldo.`
        : "Confirmamos tu pago y se acreditó tu saldo.";
    }

    case "manual_payment_rejected": {
      const motivo = (p.motivo as string) || "";
      const base = "No pudimos confirmar tu pago";
      return motivo ? `${base}: ${motivo}` : `${base}. Escríbenos para revisarlo.`;
    }

    case "account_suspended": {
      const reason = (p.reason as string) || "";
      return reason
        ? `Tu cuenta fue suspendida: ${reason}`
        : "Tu cuenta fue suspendida por moderación";
    }

    default:
      // Un tipo que no conocemos: se dice lo que traiga y NUNCA un "tienes una
      // notificación" a secas, que no informa de nada y enseña a ignorarlas.
      return (p.body as string) || (p.preview as string) || titulo || "Notificación";
  }
}

/**
 * ADÓNDE LLEVA. Ruta interna, sin dominio: la usan la campana (react-router),
 * el push (`data.route`) y el correo (pegándole delante el dominio público).
 *
 * Devuelve "" cuando de verdad no hay destino, y ese "" es una decisión, no un
 * descuido: un aviso de "tu cuenta fue suspendida" no tiene pantalla adonde ir.
 * Lo que NO puede pasar es que un aviso con `listing_id` se quede sin destino,
 * y eso lo comprueba `src/test/notificacionSiempreLleva.test.ts`.
 */
export function rutaDeNotificacion(
  type: string,
  payload: Record<string, unknown> | null | undefined,
  role: Rol = "",
): string {
  const p = payload || {};
  const base = role === "anunciante" ? "anunciante" : "buscador";
  /**
   * "Mis avisos" señalando ESE aviso: abre su pestaña, sube hasta su fila y la
   * resalta. Es adonde tiene que llevar todo lo que hable de un aviso PROPIO, y
   * no a la ficha pública: la ficha sale de `listing_cards`, que solo trae los
   * activos, así que en cuanto el aviso vence o se deshabilita el enlace deja
   * de llevar a ninguna parte — justo cuando más falta hace.
   */
  const misAvisos = p.listing_id
    ? `/dashboard/anunciante/avisos?aviso=${String(p.listing_id)}`
    : "/dashboard/anunciante/avisos";
  const fichaPublica = p.listing_id ? `/aviso/${String(p.listing_id)}` : "";

  switch (type) {
    case "saved_search_match":
      return "/dashboard/buscador/busquedas";

    case "new_message":
      return `/dashboard/${base}/mensajes${p.conversation_id ? `?c=${p.conversation_id}` : ""}`;

    case "application_status":
      // Quien postuló mira SUS postulaciones. Antes iba a la ficha del aviso,
      // que no dice en qué quedó la suya.
      return "/dashboard/buscador/postulaciones";

    case "new_review":
      // Aquí sí la ficha pública: la reseña se lee ahí y el aviso está activo.
      return fichaPublica || misAvisos;

    case "new_application":
      return "/dashboard/anunciante/postulaciones";

    case "listing_disabled":
    case "listing_enabled":
    case "listing_expiring":
      return misAvisos;

    case "complaint_new":
      return esStaff(role) ? `/dashboard/${role}/reclamaciones` : "";

    case "career_new":
      return esStaff(role) ? `/dashboard/${role}/postulaciones` : "";

    case "invoice_voided":
      // Allí ve el comprobante marcado como anulado y su motivo.
      return "/dashboard/anunciante/boletas";

    case "manual_payment_approved":
      // Si el pago era de un aviso, lo que quiere ver es el aviso; si fue una
      // recarga, su comprobante.
      return p.purpose === "publish" || p.purpose === "renew"
        ? misAvisos
        : "/dashboard/anunciante/boletas";

    case "manual_payment_rejected":
      return "/dashboard/anunciante";

    case "moderation_warning":
      // La advertencia suele ser POR un aviso concreto. Si viene, se lleva
      // hasta él; si no, al panel, que es donde se ve el estado de la cuenta.
      return p.listing_id ? misAvisos : "/dashboard/anunciante";

    case "admin_message":
      // Un mensaje del equipo puede hablar de un aviso o de nada en concreto.
      //
      // SIN AVISO NO LLEVA A NINGUNA PANTALLA, Y ES A PROPÓSITO. La campana
      // trata la ausencia de destino como "esto es informativo" y abre el texto
      // completo en un modal (ver NotificationsBell). Darle un destino haría que
      // pulsarlo navegara al panel y el mensaje del equipo —que suele ser largo
      // y no cabe en la fila— no se llegara a leer nunca.
      return p.listing_id ? misAvisos : "";

    case "account_suspended":
      // No hay pantalla adonde ir: la cuenta está suspendida.
      return "";

    default:
      // Lo desconocido, pero con aviso: al menos que lleve a su aviso.
      return p.listing_id ? misAvisos : "";
  }
}
