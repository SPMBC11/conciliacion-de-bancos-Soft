import { Monitor, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/auth/auth-provider';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type ThemePreference, useTheme } from '@/theme/theme-provider';

const THEMES = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Según el sistema', icon: Monitor },
] as const;

export function PreferencesPage() {
  const { me, membership } = useAuth();
  const { preference, setPreference } = useTheme();
  return (
    <div className="space-y-6">
      <PageHeader title="Preferencias" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Nombre</dt>
              <dd>{me?.user.fullName}</dd>
              <dt className="text-muted-foreground">Correo</dt>
              <dd>{me?.user.email}</dd>
              <dt className="text-muted-foreground">Organización</dt>
              <dd>{membership?.organizationName}</dd>
              <dt className="text-muted-foreground">Rol</dt>
              <dd>{membership?.role.name}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Apariencia</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset className="grid gap-2 sm:grid-cols-3">
              <legend className="sr-only">Tema</legend>
              {THEMES.map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5',
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={preference === value}
                    onChange={() => setPreference(value as ThemePreference)}
                    className="sr-only"
                  />
                  <Icon aria-hidden className="size-4" />
                  {label}
                </label>
              ))}
            </fieldset>
            <p className="mt-3 text-xs text-muted-foreground">
              Formato regional: es-CO · Moneda COP · Hora de Bogotá.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
