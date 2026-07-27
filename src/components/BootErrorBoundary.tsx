import { Component, type ErrorInfo, type ReactNode } from "react";
import { BootError } from "@/components/BootError";

/**
 * ErrorBoundary raíz: captura cualquier excepción durante el render/arranque del
 * árbol de React y muestra la pantalla de diagnóstico (`BootError`) en vez de un
 * blanco/splash pegado. Es el único ErrorBoundary de la app y envuelve a <App/>.
 *
 * Nota: NO captura errores en tiempo de import (esos abortan el módulo antes de
 * montar); para eso `supabase.ts` es a prueba de fallos y `main.tsx` valida la
 * config antes de renderizar la app.
 */

type Props = { children: ReactNode };
type State = { error: unknown | null };

export class BootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[boot] excepción de arranque:", error, info?.componentStack);
  }

  render() {
    if (this.state.error != null) {
      return <BootError variant="crash" error={this.state.error} />;
    }
    return this.props.children;
  }
}

export default BootErrorBoundary;
