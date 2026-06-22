import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Checkbox } from "@/components/ui/checkbox";
import authBg from "@/assets/auth-bg.jpg";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Megaphone, Search, ShieldCheck, Sparkles, Shield, Crown } from "lucide-react";

import { BrandMark } from "@/components/BrandMark";

const AuthPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const enterDemo = (role: "anunciante" | "buscador" | "admin" | "superadmin") => {
    import("@/hooks/useSession").then(({ setSession }) => setSession(role));
    if (redirectTo && (role === "anunciante" || role === "buscador")) {
      navigate(redirectTo);
      return;
    }
    if (role === "admin" || role === "superadmin") {
      navigate(`/dashboard/${role}`);
    } else {
      navigate("/");
    }
  };
  const handleLogin = () => {
    import("@/hooks/useSession").then(({ setSession }) => setSession("buscador"));
    navigate(redirectTo || "/");
  };
  const handleRegister = () => {
    import("@/hooks/useSession").then(({ setSession }) => setSession("buscador"));
    navigate(redirectTo || "/");
  };
  const [activeTab, setActiveTab] = useState<"login" | "register">(
    searchParams.get("tab") === "register" ? "register" : "login"
  );
  
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left side - hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12">
        <img src={authBg} alt="Marketplace profesional" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/85 via-primary/70 to-primary/90" />
        <div className="relative z-10 text-center max-w-lg">
          <div className="mb-4">
            <BrandMark size="xl" variant="light" asLink={false} />
          </div>
          <p className="text-primary-foreground/90 text-lg mb-2">
            La plataforma donde comprar, vender y conectar es más fácil que nunca.
          </p>
          <p className="text-primary-foreground/60 text-sm">
            Miles de oportunidades te esperan. Ingresa como anunciante o buscador para explorar.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 text-left">
            <div className="bg-card/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
              <ShieldCheck className="text-secondary mb-2" size={20} />
              <p className="text-primary-foreground text-sm font-semibold">Anunciantes verificados</p>
              <p className="text-primary-foreground/60 text-xs">Compra y vende con confianza.</p>
            </div>
            <div className="bg-card/10 backdrop-blur-sm border border-white/20 rounded-xl p-4">
              <Sparkles className="text-secondary mb-2" size={20} />
              <p className="text-primary-foreground text-sm font-semibold">Experiencia premium</p>
              <p className="text-primary-foreground/60 text-xs">Diseñada para tu comodidad.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile hero banner */}
      <div className="lg:hidden relative h-44 flex items-center justify-center overflow-hidden">
        <img src={authBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/70 via-primary/80 to-background" />
        <div className="relative z-10 text-center px-6">
          <div className="inline-flex flex-col items-center">
            <BrandMark size="lg" variant="light" asLink={false} />
          </div>
          <p className="text-primary-foreground/80 text-xs mt-2">
            Tu marketplace de confianza
          </p>
        </div>
      </div>

      {/* Right side - Auth forms */}
      <div className="flex-1 flex items-start lg:items-center justify-center p-4 sm:p-6 lg:p-12 bg-background overflow-y-auto -mt-6 lg:mt-0 z-10">
        <div className="w-full max-w-md bg-card lg:bg-transparent rounded-2xl lg:rounded-none shadow-xl lg:shadow-none border lg:border-0 p-5 sm:p-6 lg:p-0">
          {/* Desktop logo - centered */}
          <Link to="/" className="hidden lg:flex justify-center mb-8">
            <BrandMark size="lg" asLink={false} />
          </Link>

          {/* Tab toggle */}
          <div className="flex bg-muted rounded-lg p-1 mb-6">
            <button
              onClick={() => setActiveTab("login")}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-all ${
                activeTab === "login" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
              }`}
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => setActiveTab("register")}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-all ${
                activeTab === "register" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
              }`}
            >
              Registrarse
            </button>
          </div>

          {activeTab === "login" ? (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label htmlFor="email">Correo electrónico</Label>
                <Input id="email" type="email" placeholder="tu@correo.com" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative mt-1">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <Checkbox />
                  Recordarme
                </label>
                <a href="#" className="text-sm text-secondary hover:underline">¿Olvidaste tu contraseña?</a>
              </div>
              <Button className="w-full" size="lg" onClick={handleLogin}>Iniciar sesión</Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-card lg:bg-background px-2 text-muted-foreground">o continuar con</span></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="w-full">
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Google
                </Button>
                <Button variant="outline" className="w-full">
                  <svg className="w-4 h-4 mr-2" fill="#1877F2" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label htmlFor="fullName">Nombre completo</Label>
                <Input id="fullName" placeholder="Juan Pérez" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="regEmail">Correo electrónico</Label>
                <Input id="regEmail" type="email" placeholder="tu@correo.com" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="phone">Teléfono</Label>
                <div className="flex gap-2 mt-1">
                  <span className="flex items-center px-3 bg-muted rounded-md text-sm text-muted-foreground border">+51</span>
                  <Input id="phone" placeholder="999 888 777" className="flex-1 min-w-0" />
                </div>
              </div>
              <div>
                <Label htmlFor="regPassword">Contraseña</Label>
                <Input id="regPassword" type="password" placeholder="Mínimo 8 caracteres" className="mt-1" />
              </div>

              <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox className="mt-0.5" />
                <span>Acepto los <a href="#" className="text-secondary hover:underline">términos</a> y la <a href="#" className="text-secondary hover:underline">política de privacidad</a></span>
              </label>

              <Button className="w-full" size="lg" onClick={handleRegister}>Crear cuenta</Button>
            </div>

          )}

          {/* Demo buttons */}
          <div className="mt-6 pt-4 border-t border-dashed">
            <p className="text-xs text-muted-foreground text-center mb-3">Acceso rápido de demostración</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="min-w-0 gap-1.5 border-secondary/40 text-secondary hover:bg-secondary/10 hover:text-secondary"
                onClick={() => enterDemo("anunciante")}>
                <Megaphone size={14} className="flex-shrink-0" />
                <span className="truncate">Anunciante</span>
              </Button>
              <Button variant="outline" size="sm" className="min-w-0 gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                onClick={() => enterDemo("buscador")}>
                <Search size={14} className="flex-shrink-0" />
                <span className="truncate">Buscador</span>
              </Button>
              <Button variant="outline" size="sm" className="min-w-0 gap-1.5 border-primary/60 bg-primary/5 text-primary hover:bg-primary/15"
                onClick={() => enterDemo("admin")}>
                <Shield size={14} className="flex-shrink-0" />
                <span className="truncate">Administrador</span>
              </Button>
              <Button variant="outline" size="sm" className="min-w-0 gap-1.5 border-secondary/60 bg-gradient-to-r from-secondary/10 to-primary/10 text-secondary hover:from-secondary/20 hover:to-primary/20"
                onClick={() => enterDemo("superadmin")}>
                <Crown size={14} className="flex-shrink-0" />
                <span className="truncate">Super Admin</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
