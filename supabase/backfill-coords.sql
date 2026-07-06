-- Backfill de coordenadas (lat/lng) por ubicación — datos de desarrollo.
-- Geocodificado con Nominatim (OpenStreetMap) + jitter determinista por aviso
-- para que los pines de la misma ciudad no se apilen.
-- Correr en Supabase → SQL Editor (bypassa RLS) o con supabase/backfill-coords.mjs.

update public.listings set lat = -13.523845, lng = -71.976664 where id = '30e4cdf8-6263-4767-9451-3cf358772209'; -- cusco · se vende
update public.listings set lat = -13.507177, lng = -71.986684 where id = '6496603f-1ab6-43c1-bf3f-5ab7138af133'; -- cusco · nissan
update public.listings set lat = -13.515361, lng = -71.981764 where id = '47b7c64d-56a8-4652-9562-8fed33824ba9'; -- cusco · se necesita gerente
update public.listings set lat = -13.514245, lng = -71.986972 where id = '5a91cdea-635a-4e69-b5a1-9cc2e36b51bd'; -- cusco · se vente pc test
update public.listings set lat = -12.053517, lng = -77.028803 where id = '55893a8f-7bb3-4778-beea-49c275893388'; -- lima · su busca maestro pintor
update public.listings set lat = -12.047613, lng = -77.036063 where id = '21929a8f-7f42-42bb-b073-394709cf2acc'; -- lima · ce vende pc gaming
update public.listings set lat = -12.040929, lng = -77.034035 where id = 'fe87d97c-ff46-4160-98a6-0ef3994f8b9a'; -- lima · aviso test
update public.listings set lat = -12.034893, lng = -77.022947 where id = '48a0be9c-e9e0-41cf-9f8c-ccf72ea91e35'; -- LIMA · BELLEZA NATURAL
update public.listings set lat = -12.054009, lng = -77.019983 where id = '8bb75199-a569-447b-89cd-bcb4886632c0'; -- LIMA · auto
update public.listings set lat = -12.053085, lng = -77.040935 where id = '2a1b4a8e-bd70-42e8-937e-475476541a3b'; -- lima · Se necesita un programador de react
update public.listings set lat = -12.121330, lng = -77.022894 where id = '651b10f2-cf30-4285-99ed-2e38324f00e6'; -- LIMA, MIRAFLORES · ROG STRIX
update public.listings set lat = -12.036933, lng = -77.026835 where id = '66c7ca81-4a7b-4bc5-991d-b1f5f6dbdf52'; -- lima, jolapas · test trabajo
update public.listings set lat = -12.130270, lng = -77.023890 where id = '84266376-50be-4a5a-a6e0-100384daf589'; -- Lima, Miraflores · Bb
update public.listings set lat = -5.009744, lng = -80.344361 where id = '985db5b7-aab4-415e-96cc-f3f143a8f7d8'; -- piura · se busca gerente
update public.listings set lat = -5.000948, lng = -80.336921 where id = '9fafc316-20ca-43bc-ad19-6bb9767d8f07'; -- piura · iphone en venta
update public.listings set lat = -14.990316, lng = -70.006492 where id = 'a20910ae-48e5-4356-88f8-509f454ef5ce'; -- puno · fondo de computo
update public.listings set lat = -15.006552, lng = -70.007140 where id = '912f6c50-3fa4-45fb-93a6-b0ecbcd17185'; -- puno · traje

-- Verificación:
-- select count(*) filter (where lat is not null) as con_coords, count(*) as total from public.listings;
