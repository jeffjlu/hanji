import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLogin } from '@/lib/queries/auth';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useNavigate } from 'react-router';

export default function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();

  async function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    try {
      await login.mutateAsync({ email, password });
      navigate('/app');
    } catch (error) {
      console.error(error);
    }
  }
  useDocumentTitle('Sign in \| Hanji');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">Sign in</h1>
      <form onSubmit={onSubmit}>
        <Input name="email" type="email" placeholder="email"></Input>
        <Input name="password" type="password" placeholder="password"></Input>
        <Button type="submit">{login.isPending ? 'Signing in...' : 'Sign in'}</Button>
      </form>
    </main>
  );
}
