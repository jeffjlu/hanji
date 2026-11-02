import { type FastifyInstance, type InjectOptions } from 'fastify';
import { buildApp } from '../src/app.js';

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

export function buildTestApp() {
  return buildApp({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://hanji:hanji_local_dev@localhost:5432/hanji',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    WEB_ORIGIN: 'http://localhost:5173',
    REGISTRATION_CODE: 'local-invite-code',
    PORT: 3000,
  });
}

export class TestClient {
  private cookies: Record<string, string> = {};

  constructor(private app: FastifyInstance) {}

  async request(options: InjectOptions): Promise<InjectResponse> {
    const response = await this.app.inject({
      ...options,
      headers: {
        ...options.headers,
        ...(Object.keys(this.cookies).length > 0
          ? {
              cookie: Object.entries(this.cookies)
                .map(([name, value]) => `${name}=${value}`)
                .join('; '),
            }
          : {}),
      },
      payload: options.payload,
    });

    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader) {
      const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      for (const cookie of cookies) {
        const nameValue = cookie.split(';')[0];
        if (!nameValue || !nameValue.includes('=')) continue;
        const equalsIndex = nameValue.indexOf('=');
        const name = nameValue.slice(0, equalsIndex).trim();
        const value = nameValue.slice(equalsIndex + 1);

        const attributes = cookie.split(';').slice(1);
        const isExpired = attributes.some((attribute) => {
          const [key, value] = attribute.trim().split('=');

          return key?.toLowerCase() === 'max-age' && value === '0';
        });

        if (isExpired) {
          delete this.cookies[name];
        } else {
          this.cookies[name] = value;
        }
      }
    }

    return response;
  }
}
