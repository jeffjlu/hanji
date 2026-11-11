import { useRegister } from '@/lib/queries/auth';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { registerRequestSchema } from '@hanji/schemas';
import { ApiError } from '@/lib/api/errors';
import { focusFirstError } from '@/lib/forms/focusFirstError';

type RegisterField = 'email' | 'password' | 'inviteCode';

export default function RegisterPage() {
  const register = useRegister();
  const navigate = useNavigate();

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const inviteCodeRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegisterField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const FIELD_ORDER = ['email', 'password', 'inviteCode'] as const;
  const refs = { email: emailRef, password: passwordRef, inviteCode: inviteCodeRef };

  async function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    const registerRequest = { email, password, inviteCode };
    const result = registerRequestSchema.safeParse(registerRequest);

    if (!result.success) {
      const errors: Partial<Record<RegisterField, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];

        if (
          (field === 'email' || field === 'password' || field === 'inviteCode') &&
          !errors[field]
        ) {
          errors[field] = issue.message;
        }
      }

      setFieldErrors(errors);
      focusFirstError(FIELD_ORDER, errors, refs);
      return;
    }
    try {
      await register.mutateAsync(result.data);
      navigate('/app', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 403) {
          setFieldErrors({
            inviteCode: error.fieldErrors?.['inviteCode']?.[0] ?? 'Incorrect invite code.',
          });
          inviteCodeRef.current?.focus();
          return;
        } else if (error.status === 409) {
          setFieldErrors({
            email:
              error.fieldErrors?.['email']?.[0] ?? 'An account with this email already exists.',
          });
          emailRef.current?.focus();
          return;
        } else if (error.status === 429) {
          setFormError('Too many registration attempts. Please wait before trying again.');
          return;
        } else if (error.status === 400 && error.fieldErrors) {
          const errors = {
            email: error.fieldErrors['email']?.[0],
            password: error.fieldErrors['password']?.[0],
            inviteCode: error.fieldErrors['inviteCode']?.[0],
          };
          setFieldErrors(errors);
          focusFirstError(FIELD_ORDER, errors, refs);
          return;
        }
      }

      setFormError('Something went wrong. Please try again.');
    }
  }
  useDocumentTitle('Register | Hanji');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">Register</h1>
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
            autoComplete="new-password"
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
        <div>
          <label htmlFor="invite-code">Invite code</label>
          <Input
            ref={inviteCodeRef}
            id="invite-code"
            type="text"
            value={inviteCode}
            autoComplete="off"
            onChange={(event) => {
              setInviteCode(event.target.value);
              setFieldErrors((prev) => ({ ...prev, inviteCode: undefined }));
              setFormError(null);
            }}
            aria-invalid={!!fieldErrors.inviteCode}
            aria-describedby={fieldErrors.inviteCode ? 'invite-code-error' : undefined}
          />
          {fieldErrors.inviteCode && (
            <p id="invite-code-error" role="alert">
              {fieldErrors.inviteCode}
            </p>
          )}
        </div>
        {formError && <p role="alert">{formError}</p>}
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? 'Registering...' : 'Register'}
        </Button>
      </form>
      <p>Already have an account?</p>
      <Link to="/login">Sign in</Link>
    </main>
  );
}
