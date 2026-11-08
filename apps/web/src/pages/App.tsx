import { useDocumentTitle } from '@/lib/useDocumentTitle';

export default function AppPage() {
  useDocumentTitle('Hanji');
  return (
    <main>
      <h1>Hanji App</h1>
    </main>
  );
}
