/**
 * El nombre del otro participante de una conversación.
 *
 * En los avisos confidenciales lo que se muestra al comprador es el CORREO del
 * anunciante: es la vía de contacto que el anunciante eligió. El problema no es
 * que se vea —eso es a propósito— sino que iOS convierte por su cuenta
 * cualquier texto con pinta de correo en un enlace azul subrayado, y al tocarlo
 * abría Gmail y sacaba a la persona de la aplicación.
 *
 * El `<meta name="format-detection">` del index.html pide que no lo haga, pero
 * Safari no siempre lo respeta para correos. Por eso, además, el correo se
 * escribe en varios trozos: el detector busca una cadena continua y así no la
 * encuentra. El texto que se lee —y el que lee un lector de pantalla— sigue
 * siendo el correo entero.
 */
export function NombreDeContacto({
  nombre,
  esCorreo,
  className,
}: {
  nombre: string;
  esCorreo?: boolean;
  className?: string;
}) {
  const arroba = esCorreo ? nombre.indexOf("@") : -1;
  if (arroba <= 0) return <span className={className}>{nombre}</span>;

  return (
    <span className={className}>
      {nombre.slice(0, arroba)}
      <span>@</span>
      {nombre.slice(arroba + 1)}
    </span>
  );
}
