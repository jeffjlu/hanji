import { Button } from '@/components/ui/Button';
import { useCurrentUser, useLogout } from '@/lib/queries/auth';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export default function AppPage() {
  useDocumentTitle('Hanji');
  const { data: user, isPending, isError } = useCurrentUser();

  const logout = useLogout();

  async function handleLogout() {
    try {
      await logout.mutateAsync();
    } catch (error) {
      console.error(error);
    }
  }

  if (isPending) return <p>Loading...</p>;
  if (isError) return <p>Failed to load user.</p>;
  if (!user) return null;

  return (
    <main>
      <h1>Hanji App</h1>
      <h1>Welcome, {user!.email}</h1>
      <Button onClick={handleLogout} disabled={logout.isPending}>
        Sign out
      </Button>
    </main>
  );
}
