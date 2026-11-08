import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { Link } from 'react-router';

export default function NotFoundPage() {
  useDocumentTitle('Page not found \| Hanji');
  return (
    <main>
      <h1>Page not found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <Link to="/">Return home</Link>
    </main>
  );
}
