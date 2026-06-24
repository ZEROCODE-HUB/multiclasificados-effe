import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { syncSession, landingPath, AccountBlockedError } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";

// Página de retorno del flujo OAuth (Google). Supabase detecta la sesión en la
// URL automáticamente; aquí solo esperamos a que exista y redirigimos.
const AuthCallback = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect");

  useEffect(() => {
    let done = false;
    const go = async () => {
      if (done) return;
      done = true;
      try {
        const session = await syncSession();
        navigate(landingPath(session, redirect), { replace: true });
      } catch (e) {
        // Cuenta suspendida/baneada: syncSession ya cerró la sesión.
        if (e instanceof AccountBlockedError) toast.error(e.message);
        navigate("/auth", { replace: true });
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) go();
    });

    // Intento inmediato por si la sesión ya está lista.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) go();
    });

    // Salvavidas: si algo falla, volver al login tras unos segundos.
    const timeout = setTimeout(() => {
      if (!done) navigate("/auth", { replace: true });
    }, 8000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate, redirect]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <BrandMark size="lg" asLink={false} />
      <p className="text-muted-foreground text-sm animate-pulse">Iniciando sesión…</p>
    </div>
  );
};

export default AuthCallback;
