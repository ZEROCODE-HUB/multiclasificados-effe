// Departamentos del Perú, que es como se filtra la ubicación de los avisos.
//
// Son los 25 oficiales del INEI, con una salvedad decidida a propósito: LIMA Y
// CALLAO van JUNTOS en una sola opción. Políticamente el Callao es una provincia
// constitucional aparte, pero en la práctica es la misma ciudad — Bellavista
// está a 11 km del centro de Lima, más cerca que muchos distritos limeños. Si
// fueran opciones separadas, quien eligiera "Lima" no vería avisos que tiene
// cruzando la avenida.
//
// El `id` es el código de ubigeo del INEI (dos dígitos); el de Lima y Callao
// lleva los dos, porque la opción agrupa a ambos.

export interface Departamento {
  /** Código(s) de ubigeo del INEI. "15" Lima, "07" Callao. */
  id: string;
  nombre: string;
  /** Códigos que abarca, para poder cruzarlo con los datos del INEI. */
  ubigeos: string[];
}

export const DEPARTAMENTOS: Departamento[] = [
  { id: "01", nombre: "Amazonas", ubigeos: ["01"] },
  { id: "02", nombre: "Áncash", ubigeos: ["02"] },
  { id: "03", nombre: "Apurímac", ubigeos: ["03"] },
  { id: "04", nombre: "Arequipa", ubigeos: ["04"] },
  { id: "05", nombre: "Ayacucho", ubigeos: ["05"] },
  { id: "06", nombre: "Cajamarca", ubigeos: ["06"] },
  { id: "08", nombre: "Cusco", ubigeos: ["08"] },
  { id: "09", nombre: "Huancavelica", ubigeos: ["09"] },
  { id: "10", nombre: "Huánuco", ubigeos: ["10"] },
  { id: "11", nombre: "Ica", ubigeos: ["11"] },
  { id: "12", nombre: "Junín", ubigeos: ["12"] },
  { id: "13", nombre: "La Libertad", ubigeos: ["13"] },
  { id: "14", nombre: "Lambayeque", ubigeos: ["14"] },
  { id: "15", nombre: "Lima y Callao", ubigeos: ["15", "07"] },
  { id: "16", nombre: "Loreto", ubigeos: ["16"] },
  { id: "17", nombre: "Madre de Dios", ubigeos: ["17"] },
  { id: "18", nombre: "Moquegua", ubigeos: ["18"] },
  { id: "19", nombre: "Pasco", ubigeos: ["19"] },
  { id: "20", nombre: "Piura", ubigeos: ["20"] },
  { id: "21", nombre: "Puno", ubigeos: ["21"] },
  { id: "22", nombre: "San Martín", ubigeos: ["22"] },
  { id: "23", nombre: "Tacna", ubigeos: ["23"] },
  { id: "24", nombre: "Tumbes", ubigeos: ["24"] },
  { id: "25", nombre: "Ucayali", ubigeos: ["25"] },
];

/** Para servicios y productos que no son de un sitio concreto. */
export const TODO_EL_PERU = { id: "00", nombre: "Todo el Perú", ubigeos: [] } as const;
