-- =====================================================================
-- 0089_backfill_listing_department.sql — rescata los avisos activos que se
-- quedaron sin departamento, deduciéndolo de su punto en el mapa.
--
-- GENERADO por scripts/generar-backfill-departamentos.mjs el 2026-08-11.
-- No editar a mano: volver a ejecutar el script con otro número.
--
-- Un aviso sin departamento no aparece en NINGUNA búsqueda por ubicación. No es
-- un fallo visible: el aviso existe, se ve en su enlace y su dueño lo tiene en
-- "Mis avisos", pero nadie que filtre por su región lo encuentra. Por eso hay
-- que ir a buscarlos.
--
-- De dónde sale el dato: de preguntarle a Google a qué región pertenece el
-- punto que marcó cada anunciante — la misma consulta que hace la app al
-- publicar. No se adivina nada a partir del nombre del sitio.
--
-- Alcance: los 34 avisos ACTIVOS que no tenían departamento y sí punto en
-- el mapa. A los que ya lo tenían no se les toca. Los pausados, vencidos o en
-- borrador tampoco: recuperan el suyo cuando su dueño los vuelve a publicar.
--
-- Donde el punto y el texto discrepan MANDA EL PUNTO: es un dato, y el texto una
-- redacción. Sin eso, "San Martín de Porres" (un distrito de Lima) acabaría
-- archivado en el departamento de San Martín, a 700 km.
--
-- Idempotente: al segundo pase no hay nada que cambiar.
-- =====================================================================

do $$
declare
  v_pendientes int;
begin
  if to_regclass('public.listings') is null then
    raise exception 'No existe public.listings: aplica antes las migraciones anteriores';
  end if;

  create temporary table tmp_departamento_aviso (
    id         uuid primary key,
    department text not null
  ) on commit drop;

  insert into tmp_departamento_aviso (id, department) values
    ('e97392d5-ebed-4ba8-93f7-b993a49cd321', '15'),  -- Lima y Callao · Boulevard Santa María, Carabayllo
    ('cec280a6-10e2-4bdb-8ea9-2d4f139c93f7', '23'),  -- Tacna · Jesús María, Tacna
    ('06453e23-92b8-4ba3-b17e-b869edcb0200', '15'),  -- Lima y Callao · Breña
    ('3df406b2-4a0f-4236-8607-3c929248f8b6', '15'),  -- Lima y Callao · San Miguel
    ('9f65f1dd-d419-4959-8724-9cf19a32574e', '14'),  -- Lambayeque · La Victoria
    ('e4f4b4e3-27a1-4254-91e4-6d574a00a0b5', '24'),  -- Tumbes · San José, Tumbes
    ('f0c5c0d2-ba13-40c2-a83d-97404c32b75a', '15'),  -- Lima y Callao · Bellavista
    ('6e24f874-3a1a-4c48-874c-1f1cc7d9ad74', '12'),  -- Junín · San Carlos, Huancayo
    ('2a515d93-3253-416b-adb5-330110a32dd5', '13'),  -- La Libertad · Urbanización El Recreo 1ª Etapa, Trujillo
    ('6c257d72-a5ef-40ca-80f9-0b5b921f79b4', '15'),  -- Lima y Callao · La Victoria
    ('89903c2f-8d36-4f86-b102-d93fa9587ce0', '04'),  -- Arequipa · Yanahuara
    ('2fc65c40-ab31-4bf1-afd2-ccbfec5ac408', '20'),  -- Piura · Piura
    ('927da5e7-7d06-43cd-a931-0a07669dd6b9', '02'),  -- Áncash · Nuevo Chimbote
    ('d65be234-d378-479e-8608-ade31af0d674', '13'),  -- La Libertad · Urbanización Torres Araujo, Trujillo
    ('e53f4b18-63c7-46ae-8800-0d7807a0f901', '03'),  -- Apurímac · Plaza de Armas Andahuaylas, Andahuaylas
    ('7b6e898f-7d6f-40c3-a1b9-4dbceba328e1', '13'),  -- La Libertad · Trujillo
    ('131c4dbe-539c-49e4-b413-d6394523a718', '15'),  -- Lima y Callao · San Miguel
    ('0d3bf0cf-ab8a-4c7f-a421-588bdd4e581c', '15'),  -- Lima y Callao · Jesús María
    ('06081c34-b190-4736-bf8c-140e475d7362', '13'),  -- La Libertad · Chao
    ('8cb2897d-aee0-42ab-b879-a5819e48a3f1', '15'),  -- Lima y Callao · Carabayllo
    ('be353857-adbf-470e-a49e-770a56db60a7', '13'),  -- La Libertad · Curva de Sun, Moche
    ('701988a6-cb3c-458b-88db-b04c5abb4083', '15'),  -- Lima y Callao · Los Girasoles, Carabayllo
    ('1d456d42-84cf-4ee5-82e4-51fd78b13449', '25'),  -- Ucayali · San Fernando, Manantay
    ('096a8272-17c3-480c-8171-fb9811066b7e', '11'),  -- Ica · Punta La Isla, Ica
    ('91a4c0b0-56dc-44d4-be2c-249c4d00f0ae', '15'),  -- Lima y Callao · San Luis
    ('349c9d52-1c3e-4020-9163-58b30e608795', '22'),  -- San Martín · Barrio de Calvario, Moyobamba
    ('bdf41cc5-8798-4f64-bb2d-1be6ca94ad51', '12'),  -- Junín · Yanacancha, Junín
    ('b45539d1-dea9-4c12-98e5-3bf1452745d5', '15'),  -- Lima y Callao · Lince
    ('c96d3c75-d91e-4666-88f0-c773911d83ed', '15'),  -- Lima y Callao · Villa El Salvador
    ('5d45027d-caa4-46e3-b566-d87e50bac586', '15'),  -- Lima y Callao · San Isidro
    ('13ca7530-cf4d-437b-9310-3c09f2703f83', '15'),  -- Lima y Callao · Villa Bonita 4, Callao
    ('a3f7875c-8b40-46c8-bd89-7abb308f0376', '15'),  -- Lima y Callao · Haras de la Molina, La Molina
    ('b35829d9-1a82-4fa4-a4ff-6fccc5e2014a', '13'),  -- La Libertad · Trujillo
    ('39874976-3b8d-4c7b-8905-c00ff1584eae', '15')  -- Lima y Callao · Monterrico, Santiago de Surco
  ;

  -- El punto pisa lo que hubiera deducido la 0084 del texto: donde discrepan,
  -- se equivoca el texto. Solo afecta a estos 34 avisos, ninguno más.
  update public.listings l
     set department = t.department
    from tmp_departamento_aviso t
   where l.id = t.id
     and l.department is distinct from t.department;

  select count(*) into v_pendientes
    from public.listings where status = 'active' and department is null;
  raise notice 'Avisos activos que siguen sin departamento: %', v_pendientes;
end $$;
