import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/States';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Página no disponible"
      description="La dirección no existe o la sección aún no está habilitada."
      action={
        <Button asChild>
          <Link to="/dashboard">Ir al panel</Link>
        </Button>
      }
      className="py-24"
    />
  );
}
