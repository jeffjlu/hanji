import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLogin } from '@/lib/queries/auth';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { loginRequestSchema } from '@hanji/schemas';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '@/lib/api/errors';
import { focusFirstError } from '@/lib/forms/focusFirstError';

type LoginField = 'email' | 'password';
export default function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const FIELD_ORDER = ['email', 'password'] as const;
  const refs = { email: emailRef, password: passwordRef };

  async function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const loginRequest = { email, password };
    const result = loginRequestSchema.safeParse(loginRequest);

    if (!result.success) {
      const errors: Partial<Record<LoginField, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];

        if ((field === 'email' || field === 'password') && !errors[field]) {
          errors[field] = issue.message;
        }
      }

      setFieldErrors(errors);
      focusFirstError(FIELD_ORDER, errors, refs);
      return;
    }
    try {
      await login.mutateAsync(result.data);
      navigate('/app', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          emailRef.current?.focus();
          return setFormError('Invalid email or password');
        } else if (error.status === 429) {
          emailRef.current?.focus();
          return setFormError('Too many login attempts. Please wait before trying again.');
        } else if (error.status == 400 && error.fieldErrors) {
          const errors = {
            email: error.fieldErrors['email']?.[0],
            password: error.fieldErrors['password']?.[0],
          };
          focusFirstError(FIELD_ORDER, errors, refs);
          return setFieldErrors(errors);
        }
      }
      setFormError('Something went wrong. Please try again.');
    }
  }
  useDocumentTitle('Sign in | Hanji');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">Sign in</h1>
      <form onSubmit={onSubmit} noValidate>
        <div>
          <label htmlFor="email">Email</label>
          <Input
            ref={emailRef}
            id="email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldErrors((prev) => ({ ...prev, email: undefined }));
              setFormError(null);
            }}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          />
          {fieldErrors.email && (
            <p id="email-error" role="alert">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <Input
            ref={passwordRef}
            id="password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
              setFormError(null);
            }}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          />
          {fieldErrors.password && (
            <p id="password-error" role="alert">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {formError && <p role="alert">{formError}</p>}

        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
      <p>
        Don't have an account? <Link to="/register">Create an account</Link>
      </p>
    </main>
  );
}
