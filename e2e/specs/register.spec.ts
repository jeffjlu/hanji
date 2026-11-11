import { test, expect } from '@playwright/test';

test('registration page displays correctly', async ({ page }) => {
  await page.goto('/register');

  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();

  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByLabel('Invite code')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();
});

test('registration form accepts user input', async ({ page }) => {
  await page.goto('/register');

  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByLabel('Invite code').fill('test-code');

  await expect(page.getByLabel('Email')).toHaveValue('test@example.com');
  await expect(page.getByLabel('Password')).toHaveValue('Password123!');
  await expect(page.getByLabel('Invite code')).toHaveValue('test-code');
});
