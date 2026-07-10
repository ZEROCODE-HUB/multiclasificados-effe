-- 1 crédito = 1 sol.
--
-- Los paquetes se sembraron con 10 créditos por sol (Básico: 450 créditos por
-- S/ 45). Con el crédito valiendo un sol, venderían 10 veces su valor, así que
-- se igualan al precio.
--
-- Los saldos de `user_credits` NO se tocan a propósito: los usuarios conservan
-- los créditos que ya compraron.

update public.credit_packages
   set credits_amount = price_soles
 where credits_amount <> price_soles;
