import { useRegister } from '@/lib/queries/auth';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import React from 'react';
import { useNavigate } from 'react-router';

export default function RegisterPage() {
  const register = useRegister();
  const navigate = useNavigate();

  async function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const inviteCode = formData.get('invite-code') as string;
    try {
      await register.mutateAsync({ email, password, inviteCode });
      navigate('/app');
    } catch (error) {
      console.error(error);
    }
  }
  useDocumentTitle('Register \| Hanji');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">Register</h1>
      <form onSubmit={onSubmit}>
        <Input name="email" type="email" placeholder="Email" />
        <Input name="password" type="password" placeholder="Password" />
        <Input name="invite-code" placeholder="Invite code" />
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? 'Registering...' : 'Register'}
        </Button>
      </form>
    </main>
  );
}
