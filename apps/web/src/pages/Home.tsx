import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { Link } from 'react-router';

export default function HomePage() {
  useDocumentTitle('Hanji \| Learn Japanese');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">Hanji</h1>
      <p>Learn Chinese with research-informed methods.</p>

      <nav className="flex gap-4">
        <Link to="/login">Sign in</Link>
        <Link to="/register">Register</Link>
      </nav>
    </main>
  );
}
