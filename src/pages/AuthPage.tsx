import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

// Códigos de país para el teléfono (opcional).
const COUNTRY_CODES = [
  { code: "+51", flag: "🇵🇪", name: "Perú" },
  { code: "+52", flag: "🇲🇽", name: "México" },
  { code: "+57", flag: "🇨🇴", name: "Colombia" },
  { code: "+56", flag: "🇨🇱", name: "Chile" },
  { code: "+54", flag: "🇦🇷", name: "Argentina" },
  { code: "+593", flag: "🇪🇨", name: "Ecuador" },
  { code: "+591", flag: "🇧🇴", name: "Bolivia" },
  { code: "+34", flag: "🇪🇸", name: "España" },
  { code: "+1", flag: "🇺🇸", name: "EE. UU." },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
import authBg from "@/assets/auth-bg.jpg";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Megaphone, Search, ShieldCheck, Sparkles, Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { signInWithPassword, signUpWithPassword, signInWithGoogle, signInWithFacebook, landingPath } from "@/lib/auth";

const AuthPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  // Estado de formularios
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+51");
  const [phone, setPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // El acceso demo queda solo para roles de usuario (no staff). Admin/Super Admin
  // requieren login real con rol asignado en la base de datos.
  const enterDemo = (role: "anunciante" | "buscador") => {
    import("@/hooks/useSession").then(({ setSession }) => setSession(role));
    navigate(redirectTo || "/");
  };

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error("Ingresa tu correo y contraseña.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      toast.error("Ingresa un correo electrónico válido.");
      return;
    }
    setLoading(true);
    try {
      const session = await signInWithPassword(email, password);
      toast.success("¡Bienvenido de vuelta!");
      // El staff aterriza directo en su panel; el resto, donde pidió ir o al inicio.
      navigate(landingPath(session, redirectTo));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    // Correo: obligatorio + formato válido.
    if (!regEmail) {
      toast.error("Ingresa tu correo electrónico.");
      return;
    }
    if (!EMAIL_RE.test(regEmail)) {
      toast.error("Ingresa un correo electrónico válido.");
      return;
    }
    // Teléfono: opcional, pero si se ingresa debe tener exactamente 9 dígitos.
    if (phone && phone.length !== 9) {
      toast.error("El teléfono debe tener exactamente 9 dígitos.");
      return;
    }
    // Contraseña: obligatoria, mínimo 8, y debe coincidir con la confirmación.
    if (!regPassword || regPassword.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (regPassword !== regPasswordConfirm) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const session = await signUpWithPassword({
        email: regEmail,
        password: regPassword,
        phone: phone ? `${countryCode} ${phone}` : undefined,
      });
      if (session) {
        toast.success("¡Cuenta creada!");
        navigate(redirectTo || "/");
      } else {
        toast.success("Cuenta creada. Revisa tu correo para confirmar el registro.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogle(redirectTo || undefined);
      // El navegador se redirige a Google; no hace falta navegar aquí.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo conectar con Google.");
      setLoading(false);
    }
  };

  const handleFacebook = async () => {
    setLoading(true);
    try {
      await signInWithFacebook(redirectTo || undefined);
      // El navegador se redirige a Facebook; no hace falta navegar aquí.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo conectar con Facebook.");
      setLoading(false);
    }
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
                <Input id="email" type="email" placeholder="tu@correo.com" className="mt-1"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative mt-1">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }} />
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
              <Button className="w-full" size="lg" onClick={handleLogin} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : "Iniciar sesión"}
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-card lg:bg-background px-2 text-muted-foreground">o continuar con</span></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Google
                </Button>
                <Button variant="outline" className="w-full" onClick={handleFacebook} disabled={loading}>
                  <svg className="w-4 h-4 mr-2" fill="#1877F2" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div>
                <Label htmlFor="regEmail">Correo electrónico *</Label>
                <Input id="regEmail" type="email" inputMode="email" placeholder="tu@correo.com" className="mt-1"
                  value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                {regEmail && !EMAIL_RE.test(regEmail) && (
                  <p className="text-xs text-destructive mt-1">Ingresa un correo válido.</p>
                )}
              </div>
              <div>
                <Label htmlFor="phone">Teléfono <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <div className="flex gap-2 mt-1">
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger className="w-[110px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.flag} {c.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="phone"
                    inputMode="numeric"
                    placeholder="999 888 777"
                    className="flex-1 min-w-0"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  />
                </div>
                {phone.length > 0 && phone.length !== 9 && (
                  <p className="text-xs text-destructive mt-1">El número debe tener exactamente 9 dígitos.</p>
                )}
              </div>
              <div>
                <Label htmlFor="regPassword">Contraseña *</Label>
                <Input id="regPassword" type="password" placeholder="Mínimo 8 caracteres" className="mt-1"
                  value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="regPasswordConfirm">Confirmar contraseña *</Label>
                <Input id="regPasswordConfirm" type="password" placeholder="Repite tu contraseña" className="mt-1"
                  value={regPasswordConfirm} onChange={(e) => setRegPasswordConfirm(e.target.value)} />
                {regPasswordConfirm.length > 0 && regPassword !== regPasswordConfirm && (
                  <p className="text-xs text-destructive mt-1">Las contraseñas no coinciden.</p>
                )}
              </div>

              <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox className="mt-0.5" />
                <span>Acepto los <a href="#" className="text-secondary hover:underline">términos</a> y la <a href="#" className="text-secondary hover:underline">política de privacidad</a></span>
              </label>

              <Button className="w-full" size="lg" onClick={handleRegister} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : "Crear cuenta"}
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-card lg:bg-background px-2 text-muted-foreground">o regístrate con</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Google
                </Button>
                <Button variant="outline" className="w-full" onClick={handleFacebook} disabled={loading}>
                  <svg className="w-4 h-4 mr-2" fill="#1877F2" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook
                </Button>
              </div>
            </div>

          )}

          {/* Demo buttons — solo roles de usuario. Admin / Super Admin requieren login real. */}
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
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-3 flex items-center justify-center gap-1.5">
              <Crown size={12} className="text-secondary" /> El panel de administración requiere iniciar sesión con una cuenta autorizada.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
