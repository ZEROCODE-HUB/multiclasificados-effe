// El SDK de mapas de Google, cargado una sola vez para toda la app.
//
// Por qué Google y no Leaflet + OpenStreetMap, que es lo que había antes:
//
//   1. Los servidores de tiles de OSM son comunitarios y su política de uso NO
//      permite alimentar una app que se distribuye. Funcionaban mientras el
//      tráfico era pequeño, pero pueden bloquear el dominio sin avisar y ese día
//      los cuatro mapas se quedan grises a la vez.
//   2. Y sobre todo: las condiciones de Google (Service Specific Terms §3.3)
//      dicen que «Customer must not use Google Maps Content from the Geocoding
//      API in conjunction with a non-Google map». Como las direcciones y el
//      departamento del aviso salen de Google, pintarlos sobre un mapa de OSM
//      incumplía sus términos. Un solo proveedor arregla las dos cosas.
//
// Hacen falta DOS variables de entorno, y sin ellas los mapas no salen:
//
//   VITE_GOOGLE_MAPS_API_KEY  la llave del proyecto de Google Cloud
//   VITE_GOOGLE_MAPS_MAP_ID   el identificador del estilo de mapa
//
// El Map ID no es un capricho de configuración: los marcadores modernos
// (AdvancedMarkerElement), que son los que permiten poner HTML propio en el pin
// —las burbujas de precio con los colores de la marca— solo funcionan si el mapa
// tiene uno. Se crea en la consola: Google Maps Platform → Map Management →
// Create Map ID (tipo JavaScript).
//
// APIs que hay que habilitar en el proyecto: Maps JavaScript API, Places API
// (New) y Geocoding API.

import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";

const LLAVE = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY?.trim() || "";

/**
 * Identificador del estilo de mapa. Sin él los marcadores no se dibujan, así que
 * cuando falta se usa el de demostración de Google y se avisa a gritos por
 * consola: es preferible un mapa con marca de agua en desarrollo a un mapa sin
 * un solo pin y sin ninguna pista de por qué.
 */
export const MAPA_ID: string =
  import.meta.env?.VITE_GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID";

let avisadoDelMapId = false;
function comprobarMapId() {
  if (MAPA_ID !== "DEMO_MAP_ID" || avisadoDelMapId) return;
  avisadoDelMapId = true;
  console.error(
    "[mapas] Falta VITE_GOOGLE_MAPS_MAP_ID. Se está usando el mapa de " +
      "DEMOSTRACIÓN de Google, que no puede usarse en producción. Crea un Map ID " +
      "en Google Cloud → Maps Platform → Map Management y ponlo en el entorno.",
  );
}

/** True si hay llave configurada. Sin ella no se intenta cargar nada. */
export const hayMapasDeGoogle = (): boolean => LLAVE.length > 0;

export interface LibreriasDelMapa {
  maps: google.maps.MapsLibrary;
  marker: google.maps.MarkerLibrary;
}

// La carga se comparte entre los cuatro mapas: el SDK se descarga una vez por
// sesión aunque el usuario pase por la portada, el buscador y la ficha.
let enCurso: Promise<LibreriasDelMapa> | null = null;

/** Carga el SDK (una sola vez) y devuelve las piezas que usa la app. */
export function cargarMapas(): Promise<LibreriasDelMapa> {
  if (!hayMapasDeGoogle()) {
    return Promise.reject(new Error("Falta VITE_GOOGLE_MAPS_API_KEY"));
  }
  if (!enCurso) {
    comprobarMapId();
    setOptions({ key: LLAVE, v: "weekly", language: "es", region: "PE" });
    enCurso = Promise.all([importLibrary("maps"), importLibrary("marker")])
      .then(([maps, marker]) => ({ maps, marker }))
      .catch((e) => {
        // Se olvida el intento fallido para que el siguiente mapa lo reintente:
        // un corte de red al entrar no debe dejar la app sin mapas hasta que se
        // recargue la página entera.
        enCurso = null;
        throw e;
      });
  }
  return enCurso;
}

/** Solo para las pruebas: olvida la carga anterior. */
export function _reiniciarCargaDeMapas() {
  enCurso = null;
  avisadoDelMapId = false;
}

export type EstadoDelMapa = "cargando" | "listo" | "sin-llave" | "error";

/**
 * Crea un mapa de Google dentro de un div y devuelve el estado de la carga.
 *
 * Las opciones se leen UNA vez, al crear el mapa: después el mapa es un objeto
 * vivo y se le habla con sus métodos (`panTo`, `fitBounds`…), no volviéndolo a
 * construir. Por eso no hace falta memorizar el objeto que se pasa aquí.
 */
export function useMapaDeGoogle(
  opciones: google.maps.MapOptions,
  alCrear?: (mapa: google.maps.Map, libs: LibreriasDelMapa) => void,
) {
  const contenedor = useRef<HTMLDivElement | null>(null);
  const [mapa, setMapa] = useState<google.maps.Map | null>(null);
  const [libs, setLibs] = useState<LibreriasDelMapa | null>(null);
  const [estado, setEstado] = useState<EstadoDelMapa>(
    hayMapasDeGoogle() ? "cargando" : "sin-llave",
  );

  // Las opciones y el callback en refs: cambian de identidad en cada render y
  // sin esto el mapa se destruiría y volvería a crearse constantemente.
  const opcionesRef = useRef(opciones);
  opcionesRef.current = opciones;
  const alCrearRef = useRef(alCrear);
  alCrearRef.current = alCrear;

  useEffect(() => {
    if (!hayMapasDeGoogle()) return;
    let vivo = true;

    cargarMapas()
      .then((l) => {
        if (!vivo || !contenedor.current) return;
        const m = new l.maps.Map(contenedor.current, {
          mapId: MAPA_ID,
          ...opcionesRef.current,
        });
        setLibs(l);
        setMapa(m);
        setEstado("listo");
        alCrearRef.current?.(m, l);
      })
      .catch((e) => {
        if (!vivo) return;
        console.error("[mapas] no se pudo cargar el mapa de Google:", e);
        setEstado("error");
      });

    return () => { vivo = false; };
  }, []);

  return { contenedor, mapa, libs, estado };
}

/**
 * Qué decirle al usuario cuando el mapa no está.
 *
 * Nunca se deja el hueco en blanco: un recuadro vacío se lee como una avería de
 * la página, y encima el resto de la pantalla sigue siendo útil.
 */
export function textoDeEstadoDelMapa(estado: EstadoDelMapa): string | null {
  if (estado === "listo") return null;
  if (estado === "cargando") return "Cargando el mapa…";
  if (estado === "sin-llave") return "El mapa no está configurado en este entorno.";
  return "No se pudo cargar el mapa.";
}
