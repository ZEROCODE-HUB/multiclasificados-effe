import type { ReactNode } from "react";

// Dobles de react-router para pruebas que montan un componente suelto, sin
// envolverlo en un <Router>.
//
// El <Link> real lee el contexto del router y revienta si no lo encuentra, así
// que varias pruebas lo sustituían por un <a>. El mismo stub estaba copiado en
// seis archivos, cada uno con su `: any`; aquí va una sola vez y tipado.

interface PropsDeEnlace {
  children?: ReactNode;
  /** `to` acepta una ruta o un objeto de localización; solo se usa si es texto. */
  to?: string | { pathname?: string };
  [otras: string]: unknown;
}

/** <Link> reducido a un <a>: navega igual de poco, pero no exige contexto. */
export const EnlaceFalso = ({ children, to, ...resto }: PropsDeEnlace) => (
  <a href={typeof to === "string" ? to : undefined} {...resto}>
    {children}
  </a>
);
