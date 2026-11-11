import { test, expect } from '@playwright/test';

test('registration and authentication flow', async ({ page }) => {
  const email = `authtest-${crypto.randomUUID()}@example.com`;
  const password = 'Password123!';
  const inviteCode = 'e2e-invite-code';

  await page.goto('/register');

  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();

  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByLabel('Invite code')).toBeVisible();

  await test.step('enter credentials and register', async () => {
    await page.getByLabel('Email').fill(email);
    await expect(page.getByLabel('Email')).toHaveValue(email);

    await page.getByLabel('Password').fill(password);
    await expect(page.getByLabel('Password')).toHaveValue(password);

    await page.getByLabel('Invite code').fill(inviteCode);
    await expect(page.getByLabel('Invite code')).toHaveValue(inviteCode);

    await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();
    await page.getByRole('button', { name: 'Register' }).click();
  });

  // Requirement 1: should redirect to /app after successful registration
  await expect(page).toHaveURL(/\/app$/);

  // Requirement 2: should remain signed in after page refresh
  await page.reload();
  await expect(page).toHaveURL(/\/app$/);

  // Requirement 3: should redirect to /login after signing out
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Requirement 4: should be able to sign in again with same credentials
  await test.step('enter credentials and sign in', async () => {
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();

    await page.getByLabel('Email').fill(email);
    await expect(page.getByLabel('Email')).toHaveValue(email);

    await page.getByLabel('Password').fill(password);
    await expect(page.getByLabel('Password')).toHaveValue(password);

    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign in' }).click();
  });
  await expect(page).toHaveURL(/\/app$/);
});
