import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from './origin.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';

describe('isOriginAllowed', () => {
  it.each([
    {
      name: 'allows GET without origin or referer',
      method: 'GET',
      origin: undefined,
      referer: undefined,
      expected: true,
    },
    {
      name: 'allows HEAD without origin or referer',
      method: 'HEAD',
      origin: undefined,
      referer: undefined,
      expected: true,
    },
    {
      name: 'allows OPTIONS without origin or referer',
      method: 'OPTIONS',
      origin: undefined,
      referer: undefined,
      expected: true,
    },
    {
      name: 'allows a matching origin',
      method: 'POST',
      origin: ALLOWED_ORIGIN,
      referer: undefined,
      expected: true,
    },
    {
      name: 'allows a matching PATCH origin',
      method: 'PATCH',
      origin: ALLOWED_ORIGIN,
      referer: undefined,
      expected: true,
    },
    {
      name: 'allows a matching DELETE origin',
      method: 'DELETE',
      origin: ALLOWED_ORIGIN,
      referer: undefined,
      expected: true,
    },
    {
      name: 'allows a referer with a matching origin',
      method: 'POST',
      origin: undefined,
      referer: 'http://localhost:5173/',
      expected: true,
    },
    {
      name: 'allows a referer with a path (browsers send full URLs)',
      method: 'POST',
      origin: undefined,
      referer: 'http://localhost:5173/register',
      expected: true,
    },
    {
      name: 'rejects POST without origin or referer',
      method: 'POST',
      origin: undefined,
      referer: undefined,
      expected: false,
    },
    {
      name: 'rejects PATCH without origin or referer',
      method: 'PATCH',
      origin: undefined,
      referer: undefined,
      expected: false,
    },
    {
      name: 'rejects DELETE without origin or referer',
      method: 'DELETE',
      origin: undefined,
      referer: undefined,
      expected: false,
    },
    {
      name: 'rejects a null origin',
      method: 'POST',
      origin: 'null',
      referer: undefined,
      expected: false,
    },
    {
      name: 'rejects a null origin AND referer',
      method: 'POST',
      origin: undefined,
      referer: undefined,
      expected: false,
    },
    {
      name: 'rejects Origin absent, Referer from wrong origin',
      method: 'POST',
      origin: undefined,
      referer: 'http://evil.example.com/',
      expected: false,
    },
    {
      name: 'rejects a referer that only looks like a match',
      method: 'POST',
      origin: undefined,
      referer: 'http://localhost:5173.evil.com/',
      expected: false,
    },
    {
      name: 'rejects a wrong host',
      method: 'POST',
      origin: 'http://different.example.com',
      referer: undefined,
      expected: false,
    },
    {
      name: 'rejects a wrong port',
      method: 'POST',
      origin: 'http://localhost:5174',
      referer: undefined,
      expected: false,
    },
    {
      name: 'rejects a wrong scheme',
      method: 'POST',
      origin: 'https://localhost:5173',
      referer: undefined,
      expected: false,
    },
    {
      name: 'rejects a trailing slash on Origin',
      method: 'POST',
      origin: 'http://localhost:5173/',
      referer: undefined,
      expected: false,
    },
    {
      name: 'rejects an unparsable Referer',
      method: 'POST',
      origin: undefined,
      referer: 'not-a-valid-url',
      expected: false,
    },
    {
      name: 'rejects a mismatching Origin even with a matching Referer',
      method: 'POST',
      origin: 'http://evil.example.com',
      referer: ALLOWED_ORIGIN,
      expected: false,
    },
  ])('$name', ({ method, origin, referer, expected }) => {
    expect(isOriginAllowed(method, origin, referer, ALLOWED_ORIGIN)).toBe(expected);
  });
});
