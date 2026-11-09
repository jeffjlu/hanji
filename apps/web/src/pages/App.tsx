import { Button } from '@/components/ui/button';
import { useCurrentUser, useLogout } from '@/lib/queries/auth';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useNavigate } from 'react-router';

export default function AppPage() {
  useDocumentTitle('Hanji');
  const { data: user, isPending, isError } = useCurrentUser();

  const logout = useLogout();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout.mutateAsync();
      navigate('/login');
    } catch (error) {
      console.error(error);
    }
  }

  if (isPending) return <p>Loading...</p>;
  if (isError) return <p>Failed to load user.</p>;
  if (!user) return <p>Not logged in.</p>;

  return (
    <main>
      <h1>Hanji App</h1>
      <h1>Welcome, {user.email}</h1>
      <Button onClick={handleLogout} disabled={logout.isPending}>
        Log out
      </Button>
    </main>
  );
}
