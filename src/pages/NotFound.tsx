import { Link } from 'react-router';
import { buttonClass } from '../components/ui/Button';
import { EmptyState } from '../components/ui/misc';

export function NotFound() {
  return (
    <EmptyState
      title="Cette page n'existe pas"
      action={
        <Link to="/" className={buttonClass('primary')}>
          Retour à l'accueil
        </Link>
      }
      className="py-24"
    >
      Le lien suivi ne correspond à aucune page de Pécule.
    </EmptyState>
  );
}
