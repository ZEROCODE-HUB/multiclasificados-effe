-- =====================================================================
-- 0086_backfill_listing_department.sql — departamento de los avisos que ya
-- estaban publicados, deducido de su punto en el mapa.
--
-- GENERADO por scripts/generar-backfill-departamentos.mjs el 2026-08-10.
-- No editar a mano: volver a ejecutar el script.
--
-- Por qué hace falta además de la 0084: aquella deduce el departamento del
-- texto que escribió el anunciante, y la mayoría no nombra su departamento
-- ("Chancay", "Laredo", "Nuevo Chimbote"). Un aviso sin departamento no sale en
-- ningún filtro de ubicación, así que se quedarían invisibles.
--
-- De dónde sale el dato: de preguntarle a Google a qué región pertenece el
-- punto que marcó cada anunciante — la misma consulta que hace la app al
-- publicar. No se adivina nada a partir del nombre.
--
-- Alcance: los 89 avisos ACTIVOS que tenían punto en el mapa. Los
-- pausados, vencidos o en borrador no se tocan: recuperan su departamento
-- cuando su dueño los vuelve a publicar.
--
-- Va DESPUÉS de la 0084, que es la que crea la columna y hace el primer intento
-- por texto. Donde las dos no coinciden MANDA ESTA: el punto es un dato y el
-- texto una redacción. Sin esto, "San Martín de Porres" (un distrito de Lima)
-- se quedaría archivado en el departamento de San Martín, a 700 km.
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
    ('912f6c50-3fa4-45fb-93a6-b0ecbcd17185', '21'),  -- Puno · puno
    ('55893a8f-7bb3-4778-beea-49c275893388', '15'),  -- Lima y Callao · lima
    ('21929a8f-7f42-42bb-b073-394709cf2acc', '15'),  -- Lima y Callao · lima
    ('48a0be9c-e9e0-41cf-9f8c-ccf72ea91e35', '15'),  -- Lima y Callao · LIMA
    ('a5daebb7-a87d-4728-9d0e-e2e7f043bcf9', '12'),  -- Junín · La Punta, Sapallanga
    ('6496603f-1ab6-43c1-bf3f-5ab7138af133', '08'),  -- Cusco · cusco
    ('d7627183-0aca-43e5-a1ee-83fb622ebfce', '15'),  -- Lima y Callao · Urbanización Cercado de Lima, Lima
    ('66c7ca81-4a7b-4bc5-991d-b1f5f6dbdf52', '15'),  -- Lima y Callao · lima, jolapas
    ('fe87d97c-ff46-4160-98a6-0ef3994f8b9a', '15'),  -- Lima y Callao · lima
    ('651b10f2-cf30-4285-99ed-2e38324f00e6', '15'),  -- Lima y Callao · LIMA,  MIRAFLORES
    ('8bb75199-a569-447b-89cd-bcb4886632c0', '15'),  -- Lima y Callao · LIMA
    ('2c826bd3-60d2-47d5-8863-4e3d03ed30a9', '15'),  -- Lima y Callao · Lima
    ('75957bb1-2e69-44f7-a71d-eb29c0f002df', '25'),  -- Ucayali · Fray Martín, Pucallpa
    ('4e8ae5d0-e51d-496a-a800-657205d34c69', '15'),  -- Lima y Callao · Lima
    ('001ceceb-2ab8-419f-81c2-4e95484d033a', '13'),  -- La Libertad · Laredo
    ('ffc5ad14-9e0d-4369-b3dd-77b71614a461', '15'),  -- Lima y Callao · Lima
    ('38cde38a-7b8c-4871-bb90-842c736ba22e', '15'),  -- Lima y Callao · Lima
    ('8bad92dc-9fca-457b-ab05-c4290dd35642', '15'),  -- Lima y Callao · Lima
    ('25c39df4-9e1d-4b9f-8bef-881dcb7cf965', '13'),  -- La Libertad · Av. 28 de Julio 368
    ('9c0e9cf2-f632-4838-aac5-fb38ef1a4cfe', '13'),  -- La Libertad · Cascas
    ('5e51d466-8cec-4894-9e9f-398e1b4908ff', '13'),  -- La Libertad · Casa Grande
    ('f1e01f2b-e4b5-445a-b30c-e763d3e01456', '15'),  -- Lima y Callao · San Martín de Retes, Huaral
    ('a9e08cc0-9416-4931-9c28-f6d300e09481', '15'),  -- Lima y Callao · Carmen de la Legua Reynoso, Carmen de La Legua-Reynoso
    ('01e6d187-aa3f-448d-802f-a69c17900d0c', '15'),  -- Lima y Callao · San Luis
    ('0c304f5d-af58-4700-848e-780350c6b4a5', '15'),  -- Lima y Callao · Rimac, Rímac
    ('44a55f4f-d343-45a0-a7ec-b59dca6d9d50', '23'),  -- Tacna · Jesús María, Tacna
    ('0287f76b-7161-4601-9082-cecf93256a8c', '15'),  -- Lima y Callao · San Miguel
    ('5ebb8aec-9ebc-4a46-a203-9ee07c6d9fe0', '20'),  -- Piura · San Eduardo, Piura
    ('182651a7-29f1-416e-a342-ed1c807c1764', '08'),  -- Cusco · San Blas, Cuzco
    ('fc44353e-c54b-4d90-8c02-9dc12ced35ca', '13'),  -- La Libertad · Virú
    ('197ae32c-0bae-4c13-9b7a-8ff527edbea2', '11'),  -- Ica · Condorillo, Chincha Alta
    ('e8805f55-a065-4de7-ac60-3c21ac07dc63', '13'),  -- La Libertad · Vista Alegre, Víctor Larco Herrera
    ('75d99460-cda7-424f-8a26-8c91aeb043cb', '15'),  -- Lima y Callao · San Isidro
    ('233161cf-23c6-47a7-bdb6-e9b6ef3dcabd', '14'),  -- Lambayeque · Lambayeque
    ('23c94091-db3f-4add-a902-07d621d089da', '06'),  -- Cajamarca · Cajamarca
    ('b665cb85-861b-42f0-b4fa-df4ecb6996c2', '20'),  -- Piura · Pachitea, Piura
    ('a0573904-3e2f-4ba3-91e8-379baf84e27c', '15'),  -- Lima y Callao · Lurín
    ('bd00039f-da81-4ef3-8345-95dad331a954', '15'),  -- Lima y Callao · Santa Anita
    ('21392d39-be41-480d-be1a-75ede376ea8f', '13'),  -- La Libertad · Chepén
    ('4ade123b-6384-4458-80a4-075157cb602a', '14'),  -- Lambayeque · Chiclayo
    ('8e1c46a8-8c03-4f22-a708-bd58b9c390d3', '04'),  -- Arequipa · Las Mercedes, Arequipa
    ('e82c5a7f-6cbd-40e8-a879-29e47550a6de', '14'),  -- Lambayeque · Chiclayo
    ('0b79b00f-efc5-4af6-9dfd-82f2fbda80a5', '15'),  -- Lima y Callao · San Pablo, La Victoria
    ('b81ac25a-db38-4623-a8a4-56bf313679a2', '15'),  -- Lima y Callao · Miraflores
    ('298d634e-894f-4c9f-9439-ad8a26af7641', '16'),  -- Loreto · Iquitos
    ('7e6be9d9-1b7b-42f6-9d2d-727e7853184b', '15'),  -- Lima y Callao · Jesús María
    ('5d714ce0-d25a-4a83-99d8-f905e022c918', '08'),  -- Cusco · Cuzco
    ('7df74e2c-d22d-40ac-90a7-b070608c6c86', '13'),  -- La Libertad · Trujillo
    ('392dcfb1-8fab-4159-8d68-cbb65e3bf242', '15'),  -- Lima y Callao · Chancay
    ('7d0461ea-bd32-486d-9866-de1375bece1b', '15'),  -- Lima y Callao · Chancay
    ('14ca5f1e-b9ca-4e16-916d-9b9831b62ae1', '13'),  -- La Libertad · Pacasmayo
    ('224fd0c4-722a-4cba-8787-409b2fee8ee3', '13'),  -- La Libertad · Chepén
    ('6bfd26e0-c002-4c65-be99-ca9346c62737', '14'),  -- Lambayeque · La Victoria
    ('529fe87d-d883-49d0-9590-a96d182593ce', '15'),  -- Lima y Callao · Santa Modesta, Santiago de Surco
    ('44350009-bf82-4c6c-b5a7-15770bca7e7d', '15'),  -- Lima y Callao · Paramonga
    ('43bcc2d4-e406-41a4-975e-82d42fe2fb17', '15'),  -- Lima y Callao · San Isidro
    ('6a9ffd09-9f5d-4265-8378-b025327368c4', '15'),  -- Lima y Callao · La Victoria
    ('eb98880e-2675-481c-9a0c-f3535c7c8bab', '02'),  -- Áncash · Nuevo Chimbote
    ('c47df91a-a95b-4b1e-a539-24c2173fc1b1', '15'),  -- Lima y Callao · La Siberia, Callao
    ('3d75e571-6a0f-48ed-a013-6e5b1c39bd1f', '13'),  -- La Libertad · Urbanización El Recreo 1ª Etapa, Trujillo
    ('dffd7ef3-e0fa-4004-a902-d417b71943bc', '12'),  -- Junín · Huancayo
    ('a2908c60-7368-4322-a2c9-3272636aa0e8', '19'),  -- Pasco · Túpac Amaru, Cerro de Pasco
    ('3cb6b09f-5527-4ea5-8c58-203fa05f7bf0', '04'),  -- Arequipa · Miraflores
    ('45e2fdbc-f968-4bdd-b704-1fccd5b4700f', '15'),  -- Lima y Callao · San Juan Macías, San Borja
    ('b6e475fb-9f87-4e85-90e5-e13464879fbf', '02'),  -- Áncash · Centro, Chimbote
    ('8d5302f5-dc9f-4ea6-b917-60b0789e1630', '06'),  -- Cajamarca · Urbanización Ramon Castilla, Cajamarca
    ('cb274bdc-ee79-410e-a2f6-e6722181631f', '15'),  -- Lima y Callao · Lima
    ('afec25af-9245-4f33-91db-584ace791eb8', '15'),  -- Lima y Callao · San Martín de Porres
    ('b62aec43-bc30-40bb-81fe-eeb8a9ccd966', '13'),  -- La Libertad · Curva de Sun, Moche
    ('fa982758-9889-4623-b70d-1cf1ea4e54f2', '11'),  -- Ica · Acomayo, Parcona
    ('20dc41ea-05f2-4103-ae0d-7362dfd8da5f', '10'),  -- Huánuco · Huánuco
    ('e0ada5eb-59e4-4448-a122-1510dd2cc6e0', '11'),  -- Ica · Cachiche, Ica
    ('cd805cbc-27f4-4cff-a0a8-482df1e67857', '20'),  -- Piura · La Alameda de Miraflores Country, Castilla
    ('f531718d-1d88-4886-a528-590b0fccbb48', '15'),  -- Lima y Callao · La Victoria
    ('a20910ae-48e5-4356-88f8-509f454ef5ce', '21'),  -- Puno · puno
    ('982b2d15-cec4-4aaf-9981-cb09d1bb77c6', '04'),  -- Arequipa · Mariano Melgar
    ('f4b3d682-2aee-400f-9ad9-d21adb715a8b', '21'),  -- Puno · Chilla, Juliaca
    ('9f2a6853-2a5f-4f9c-b937-d9b9320e8ca3', '13'),  -- La Libertad · La Esperanza
    ('a92b07f9-549d-42e1-a0bb-01101ea11253', '23'),  -- Tacna · Paraíso, Ilabaya
    ('e8844f4d-c453-4cc6-9efe-4bb82078f280', '13'),  -- La Libertad · Trujillo
    ('1c874619-ab16-4c67-bb27-8604e1906bd1', '02'),  -- Áncash · Nuevo Chimbote
    ('e588f6f6-f1d2-45d9-ba7a-ff9581370ef7', '15'),  -- Lima y Callao · Huacho
    ('a2b92155-9dcc-42ef-a451-fdec9f4832c2', '15'),  -- Lima y Callao · Lima
    ('11208d3b-c0da-46e9-aeed-f90c410cd9f2', '13'),  -- La Libertad · Vista Alegre, Víctor Larco Herrera
    ('612f95c6-29e4-499d-93ca-aa1dda89239d', '13'),  -- La Libertad · Alto Salaverry, La Libertad
    ('5d949438-9dc0-4457-a9cc-6b31f5577b52', '22'),  -- San Martín · Tarapoto
    ('d592ab32-55ae-46e9-a2f0-1f8013ef4f0d', '15'),  -- Lima y Callao · Los Jardines de Salamanca, Ate
    ('ecbd9691-04bf-4c13-83e0-f98c1e4998ae', '15'),  -- Lima y Callao · Chancay
    ('541086cc-5fc6-4ae6-a446-3fe5e5c6ff25', '15')  -- Lima y Callao · San Cosme, La Victoria
  ;

  -- El punto pisa lo que hubiera deducido la 0084 del texto: donde discrepan,
  -- se equivoca el texto. Solo afecta a estos 89 avisos, ninguno más.
  update public.listings l
     set department = t.department
    from tmp_departamento_aviso t
   where l.id = t.id
     and l.department is distinct from t.department;

  select count(*) into v_pendientes
    from public.listings where status = 'active' and department is null;
  raise notice 'Avisos activos que siguen sin departamento: %', v_pendientes;
end $$;
