// Desde qué país entra quien mira, sin preguntarle nada.
//
// Vercel ya sabe el país de cada visita —lo deduce de la IP en su red— y lo
// pone en la cabecera `x-vercel-ip-country`. Es gratis, no pide permisos, no
// tarda y acierta salvo con VPN.
//
// Por qué no las alternativas:
//   · Zona horaria del equipo: fallaba en cuanto la hora estaba mal puesta.
//     Comprobado en producción: un equipo peruano con America/Caracas hacía que
//     el buscador filtrara por Venezuela y no se viera ningún aviso.
//   · Permiso de ubicación: interrumpe con un cuadro del sistema para saber
//     algo que no hace falta con esa precisión — y en el WebView de iOS ya nos
//     dio callbacks que no responden nunca.
//   · Preguntar al entrar: una pregunta más antes de ver nada, y la respuesta
//     es "Perú" en el 99 % de los casos.
//
// El país que sale de aquí NO manda: es solo el valor con el que arranca el
// filtro, y el usuario lo cambia cuando quiera.

export const config = { runtime: "edge" };

// Se cachea un rato en el navegador: dentro de una misma visita no cambia.
const CACHE = "public, max-age=3600, s-maxage=0";

export default function handler(req: Request): Response {
  const cabecera = req.headers.get("x-vercel-ip-country") ?? "";
  const pais = /^[A-Za-z]{2}$/.test(cabecera) ? cabecera.toUpperCase() : null;

  return new Response(JSON.stringify({ pais }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": CACHE,
      // El APK corre desde el dispositivo, no desde este dominio.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
