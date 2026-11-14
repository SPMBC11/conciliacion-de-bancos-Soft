import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/theme/theme-provider';

/** Notificaciones emergentes (éxito, error, información). Uso: toast.success('…') de 'sonner'. */
export function Toaster() {
  const { resolved } = useTheme();
  return <Sonner theme={resolved} position="top-right" richColors closeButton />;
}
