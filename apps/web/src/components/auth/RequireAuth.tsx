import { Navigate, Outlet } from 'react-router';
import { useCurrentUser } from '@/lib/queries/auth';

export function RequireAuth() {
  const { data: user, isPending, isError } = useCurrentUser();

  if (isPending) {
    return <p>Loading...</p>;
  }

  if (isError || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
