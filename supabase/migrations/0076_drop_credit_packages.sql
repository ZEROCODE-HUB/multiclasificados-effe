-- Elimina credit_packages: tabla huérfana. Ninguna pantalla de usuario la lee;
-- la compra de saldo (BuyCreditsModal / create-payment) calcula el monto por
-- cantidad×duración×adicionales e ignora los paquetes. Solo la escribía el CRUD
-- "Paquetes de saldo" del admin, retirado en este mismo despliegue. DROP TABLE
-- elimina también sus políticas RLS y grants asociados.
drop table if exists public.credit_packages;
