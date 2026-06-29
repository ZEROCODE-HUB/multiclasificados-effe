import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Términos y Condiciones del Servicio + Política de Tratamiento de Datos
// Personales de CORP LOZANOCHEFFER SAC (documento único). Última actualización:
// 16 de junio de 2026.
const LAST_UPDATED = "16 de junio de 2026";

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-foreground">
        {n}. {title}
      </h3>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

/** Contenido completo del documento legal (reutilizable). */
export function LegalTermsContent() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-secondary font-bold">
          Publicación de Avisos Clasificados
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          El presente documento (en adelante, los “Términos y Condiciones”) regula el acceso y uso
          del servicio de publicación de avisos clasificados, con y sin opción de visibilidad
          destacada (en adelante, el “Servicio”), ofrecido por CORP LOZANOCHEFFER SAC, identificada
          con RUC N° 20616009061, con domicilio fiscal en Ramal Sun S/N – Huaca del Sol - Moche,
          Trujillo, Perú (en adelante, “LA EMPRESA”). Al registrarse, contratar, acceder o utilizar
          el Servicio, el usuario (en adelante, “EL CLIENTE”) declara haber leído, comprendido y
          aceptado de forma libre, expresa, informada e inequívoca el contenido íntegro de estos
          Términos y Condiciones, incluyendo la Política de Tratamiento de Datos Personales aquí
          contenida.
        </p>
      </div>

      <Section n="1" title="Objeto y alcance del servicio">
        <p>
          LA EMPRESA pone a disposición de EL CLIENTE una plataforma digital para la publicación de
          avisos clasificados, los cuales podrán contratarse bajo dos modalidades:
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-foreground">Aviso sin visibilidad destacada:</strong>{" "}
              publicación estándar del aviso dentro del listado general de la categoría
              correspondiente, sujeta a los tiempos y posiciones determinados por el algoritmo de
              ordenamiento de la plataforma.
            </>,
            <>
              <strong className="text-foreground">Aviso con visibilidad destacada:</strong>{" "}
              publicación que incluye beneficios adicionales de posicionamiento, tales como mayor
              exposición, ubicación preferente, renovación automática de vigencia u otros atributos
              descritos en el plan contratado, conforme a las tarifas vigentes publicadas por LA
              EMPRESA.
            </>,
          ]}
        />
        <p>
          La aceptación de estos Términos y Condiciones es condición previa, necesaria e
          indispensable para acceder a cualquiera de las modalidades del Servicio.
        </p>
      </Section>

      <Section n="2" title="Aceptación del contrato">
        <Bullets
          items={[
            <>
              La ejecución de cualquier acción de contratación, registro, pago o publicación de un
              aviso constituye la manifestación expresa de la voluntad de EL CLIENTE de aceptar
              íntegramente estos Términos y Condiciones, con el mismo valor y efectos jurídicos que
              una firma manuscrita, conforme a lo establecido en el artículo 141 y 141-A del Código
              Civil peruano y en la Ley N° 27269, Ley de Firmas y Certificados Digitales.
            </>,
            <>
              LA EMPRESA podrá modificar el contenido de estos Términos y Condiciones en cualquier
              momento, notificando los cambios a través de la plataforma o al correo electrónico
              registrado por EL CLIENTE. El uso continuado del Servicio luego de dicha notificación
              implica la aceptación de las modificaciones.
            </>,
            <>
              Si EL CLIENTE no está de acuerdo con los presentes Términos y Condiciones, deberá
              abstenerse de utilizar el Servicio.
            </>,
          ]}
        />
      </Section>

      <Section n="3" title="Marco normativo aplicable">
        <p>
          El tratamiento de los datos personales de EL CLIENTE por parte de LA EMPRESA se rige por el
          siguiente marco normativo:
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-foreground">Normativa nacional (Perú):</strong> Ley N° 29733,
              Ley de Protección de Datos Personales, y su Reglamento aprobado por Decreto Supremo N°
              003-2013-JUS, así como las directivas emitidas por la Autoridad Nacional de Protección
              de Datos Personales (ANPD); Constitución Política del Perú, artículo 2, inciso 6; Código
              Civil; Código de Protección y Defensa del Consumidor (Ley N° 29571); y Ley N° 27269, Ley
              de Firmas y Certificados Digitales.
            </>,
            <>
              <strong className="text-foreground">Estándares y principios internacionales:</strong>{" "}
              se han considerado, de manera referencial y complementaria, principios reconocidos en el
              Reglamento General de Protección de Datos de la Unión Europea (RGPD - UE 2016/679), las
              Directrices de la OCDE sobre Privacidad, y los principios universales de protección de
              datos (legalidad, finalidad, proporcionalidad, calidad, seguridad, disposición de
              recurso, nivel de protección adecuado y consentimiento), en lo que resulte aplicable y
              no contravenga la normativa peruana.
            </>,
          ]}
        />
      </Section>

      <Section n="4" title="Datos personales recopilados">
        <p>
          Para la prestación del Servicio, LA EMPRESA podrá recopilar y tratar las siguientes
          categorías de datos personales de EL CLIENTE:
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-foreground">Datos de identificación:</strong> nombres y
              apellidos, tipo y número de documento de identidad (DNI, RUC, carné de extranjería o
              pasaporte), fecha de nacimiento.
            </>,
            <>
              <strong className="text-foreground">Datos de contacto:</strong> correo electrónico,
              número telefónico, dirección física, ciudad y país de residencia.
            </>,
            <>
              <strong className="text-foreground">Datos de facturación y pago:</strong> información
              requerida para la emisión de comprobantes de pago y el procesamiento de transacciones,
              gestionados a través de pasarelas de pago certificadas.
            </>,
            <>
              <strong className="text-foreground">Datos de navegación y uso:</strong> dirección IP,
              identificadores de dispositivo, cookies, historial de avisos publicados, preferencias
              de búsqueda y estadísticas de interacción con la plataforma.
            </>,
            <>
              <strong className="text-foreground">Datos contenidos en los avisos:</strong> la
              información que EL CLIENTE decida incluir voluntariamente en el contenido del aviso
              publicado, siendo de su exclusiva responsabilidad evitar la inclusión de datos sensibles
              o de terceros sin autorización.
            </>,
          ]}
        />
      </Section>

      <Section n="5" title="Finalidad del tratamiento">
        <p>Los datos personales de EL CLIENTE serán tratados para las siguientes finalidades:</p>
        <Bullets
          items={[
            "Gestionar el registro, la autenticación y la administración de la cuenta de EL CLIENTE.",
            "Procesar la contratación, publicación, renovación y visualización de los avisos clasificados, con o sin visibilidad destacada.",
            "Procesar pagos, emitir comprobantes electrónicos y cumplir con obligaciones tributarias y contables.",
            "Brindar atención al cliente, soporte técnico y atención de reclamos.",
            "Enviar comunicaciones operativas vinculadas al Servicio (confirmaciones, vencimientos, renovaciones).",
            "Previa autorización expresa, remitir comunicaciones comerciales, promocionales y publicitarias sobre productos o servicios de LA EMPRESA o de terceros aliados.",
            "Realizar análisis estadísticos, segmentación y mejora continua de la plataforma y de la experiencia de usuario.",
            "Cumplir con obligaciones legales, requerimientos de autoridades competentes y prevención de fraude.",
          ]}
        />
      </Section>

      <Section n="6" title="Consentimiento del titular">
        <Bullets
          items={[
            "EL CLIENTE otorga su consentimiento previo, informado, expreso e inequívoco para el tratamiento de sus datos personales conforme a las finalidades descritas en la cláusula 5, al ejecutar el acceso, registro o contratación del Servicio mediante la aceptación electrónica de los presentes Términos y Condiciones.",
            "El consentimiento para finalidades distintas a la ejecución del contrato (por ejemplo, el envío de publicidad de terceros) podrá ser otorgado de manera separada y opcional, pudiendo EL CLIENTE marcar o desmarcar dicha opción en el formulario correspondiente, sin que ello afecte la prestación del Servicio principal.",
            "EL CLIENTE podrá revocar su consentimiento en cualquier momento, sin efectos retroactivos, conforme al procedimiento descrito en la cláusula 9 sobre derechos ARCO.",
          ]}
        />
      </Section>

      <Section n="7" title="Banco de datos personales y encargo de tratamiento">
        <Bullets
          items={[
            "Los datos personales de EL CLIENTE serán incorporados a un banco de datos de uso propio, titularidad de CORP LOZANOCHEFFER SAC, el cual será inscrito ante el Registro Nacional de Protección de Datos Personales administrado por la Autoridad Nacional de Protección de Datos Personales (ANPD), conforme a lo exigido por la Ley N° 29733 y su Reglamento.",
            "LA EMPRESA podrá encargar el tratamiento de determinados datos a proveedores de servicios tecnológicos, de hosting, de mensajería, de procesamiento de pagos o de analítica web, quienes actuarán como encargados de tratamiento, sujetos a obligaciones contractuales de confidencialidad y seguridad, y únicamente para los fines encomendados por LA EMPRESA.",
          ]}
        />
      </Section>

      <Section n="8" title="Transferencia y flujo transfronterizo de datos">
        <p>
          En caso de que LA EMPRESA contrate proveedores de servicios cuyos servidores o
          infraestructura se encuentren ubicados fuera del territorio peruano (incluyendo servicios
          de almacenamiento en la nube, pasarelas de pago internacionales o herramientas de
          analítica), dicho flujo transfronterizo de datos personales se realizará garantizando un
          nivel de protección adecuado, conforme a lo dispuesto en el artículo 15 de la Ley N° 29733 y
          los artículos 71 a 83 de su Reglamento, ya sea mediante la verificación de que el país de
          destino cuente con un nivel de protección adecuado, la suscripción de cláusulas
          contractuales de protección de datos, o la obtención del consentimiento de EL CLIENTE cuando
          ello sea exigible.
        </p>
      </Section>

      <Section n="9" title="Derechos del titular de datos personales (Derechos ARCO)">
        <p>
          EL CLIENTE, en su calidad de titular de datos personales, podrá ejercer en cualquier
          momento y de forma gratuita los siguientes derechos, reconocidos por la Ley N° 29733 y su
          Reglamento:
        </p>
        <Bullets
          items={[
            <>
              <strong className="text-foreground">Acceso:</strong> conocer qué datos personales son
              objeto de tratamiento, su origen y las finalidades del mismo.
            </>,
            <>
              <strong className="text-foreground">Rectificación:</strong> solicitar la corrección de
              datos inexactos, incompletos o desactualizados.
            </>,
            <>
              <strong className="text-foreground">Cancelación o supresión:</strong> solicitar la
              eliminación de sus datos personales del banco de datos cuando ya no resulten necesarios
              para las finalidades para las cuales fueron recopilados, salvo que exista una obligación
              legal de conservarlos.
            </>,
            <>
              <strong className="text-foreground">Oposición:</strong> oponerse al tratamiento de sus
              datos personales para finalidades específicas, en particular respecto del envío de
              comunicaciones comerciales o publicitarias.
            </>,
            <>
              <strong className="text-foreground">Portabilidad:</strong> solicitar la entrega de sus
              datos personales en un formato estructurado, de uso común y lectura mecanizada, cuando
              ello sea técnicamente posible.
            </>,
          ]}
        />
        <p>
          Para ejercer estos derechos, EL CLIENTE deberá enviar una solicitud al correo electrónico{" "}
          <a href="mailto:privacidad@coleffe.com" className="text-secondary hover:underline">
            privacidad@coleffe.com
          </a>
          , adjuntando copia de su documento de identidad y la descripción clara de su solicitud. LA
          EMPRESA atenderá dicha solicitud dentro del plazo establecido por la normativa vigente
          (veinte días hábiles, prorrogables conforme a ley). En caso de disconformidad con la
          respuesta, EL CLIENTE podrá presentar un reclamo ante la Autoridad Nacional de Protección de
          Datos Personales (ANPD).
        </p>
      </Section>

      <Section n="10" title="Plazo de conservación de los datos">
        <p>
          Los datos personales de EL CLIENTE serán conservados durante el tiempo que dure la relación
          contractual derivada de la contratación del Servicio y, posteriormente, durante los plazos
          adicionales que resulten necesarios para el cumplimiento de obligaciones legales,
          tributarias, contables o de atención de reclamos, así como para la atención de los plazos de
          prescripción legalmente establecidos. Una vez cumplidas dichas finalidades, los datos serán
          eliminados, anonimizados o bloqueados, según corresponda.
        </p>
      </Section>

      <Section n="11" title="Medidas de seguridad">
        <p>
          LA EMPRESA implementa medidas de seguridad de índole técnica, organizativa y legal
          razonables y proporcionales al riesgo, destinadas a proteger los datos personales de EL
          CLIENTE contra su alteración, pérdida, tratamiento o acceso no autorizado, conforme a lo
          dispuesto en la Ley N° 29733, su Reglamento y la Directiva de Seguridad de la Información
          administrada por la ANPD. Dichas medidas incluyen, entre otras, el cifrado de información
          sensible, controles de acceso basados en roles, copias de seguridad periódicas y protocolos
          de respuesta ante incidentes de seguridad.
        </p>
      </Section>

      <Section n="12" title="Cookies y tecnologías de seguimiento">
        <p>
          La plataforma utiliza cookies y tecnologías similares con la finalidad de mejorar la
          experiencia de navegación, recordar preferencias, realizar análisis estadísticos y, de ser
          autorizado por EL CLIENTE, mostrar publicidad personalizada. EL CLIENTE puede configurar su
          navegador para rechazar o eliminar cookies, considerando que ello podría afectar el correcto
          funcionamiento de determinadas secciones de la plataforma.
        </p>
      </Section>

      <Section n="13" title="Responsabilidad sobre el contenido de los avisos">
        <p>
          EL CLIENTE es el único responsable del contenido, veracidad, legalidad y exactitud de la
          información incluida en los avisos clasificados publicados, así como de contar con la
          autorización correspondiente respecto de cualquier dato personal de terceros que decida
          incluir en dichos avisos. LA EMPRESA podrá, sin que ello genere obligación alguna, revisar,
          suspender o eliminar avisos que infrinjan la normativa vigente, derechos de terceros o las
          políticas de uso de la plataforma.
        </p>
      </Section>

      <Section n="14" title="Vigencia, modificación y resolución">
        <p>
          Estos Términos y Condiciones entrarán en vigencia desde el momento de su aceptación por
          parte de EL CLIENTE y se mantendrán vigentes durante todo el periodo de uso del Servicio. LA
          EMPRESA se reserva el derecho de modificar, suspender o discontinuar el Servicio, total o
          parcialmente, previa comunicación a través de los canales habituales de contacto, sin que
          ello genere derecho a indemnización a favor de EL CLIENTE, salvo lo dispuesto por norma
          imperativa.
        </p>
      </Section>

      <Section n="15" title="Legislación aplicable y jurisdicción">
        <p>
          Los presentes Términos y Condiciones se rigen por las leyes de la República del Perú.
          Cualquier controversia derivada de su interpretación, ejecución o cumplimiento será sometida
          a los jueces y tribunales del distrito judicial correspondiente al domicilio de LA EMPRESA,
          sin perjuicio de las normas de protección al consumidor que resulten aplicables y de las
          vías administrativas ante INDECOPI o la ANPD, según corresponda.
        </p>
      </Section>

      <Section n="16" title="Canales de contacto">
        <Bullets
          items={[
            <><strong className="text-foreground">Razón social:</strong> CORP LOZANOCHEFFER SAC</>,
            <><strong className="text-foreground">RUC:</strong> 20616009061</>,
            <><strong className="text-foreground">Domicilio:</strong> Ramal Sun S/N – Huaca del Sol – Campiña de Moche</>,
            <>
              <strong className="text-foreground">Correo de contacto / privacidad:</strong>{" "}
              <a href="mailto:privacidad@coleffe.com" className="text-secondary hover:underline">
                privacidad@coleffe.com
              </a>
            </>,
            <><strong className="text-foreground">Teléfono:</strong> +51 957 531 755</>,
          ]}
        />
      </Section>

      <div className="border-t pt-4 space-y-2">
        <p className="text-xs italic text-muted-foreground">
          Al hacer clic en “Aceptar”, registrarse, contratar o publicar un aviso a través de la
          plataforma, EL CLIENTE declara haber leído y aceptado de manera libre, expresa e informada
          el presente documento de Términos y Condiciones y Política de Tratamiento de Datos
          Personales de CORP LOZANOCHEFFER SAC.
        </p>
        <p className="text-xs text-muted-foreground">
          Fecha de última actualización: {LAST_UPDATED}
        </p>
      </div>
    </div>
  );
}

interface TermsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Modal con el documento completo de Términos y Condiciones + Política de Privacidad. */
export function TermsDialog({ open, onOpenChange }: TermsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Términos y Condiciones y Política de Privacidad</DialogTitle>
          <DialogDescription>
            CORP LOZANOCHEFFER SAC — RUC N° 20616009061. Lee el documento completo antes de aceptar.
          </DialogDescription>
        </DialogHeader>
        <LegalTermsContent />
      </DialogContent>
    </Dialog>
  );
}
