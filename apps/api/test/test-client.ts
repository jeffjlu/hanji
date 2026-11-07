import { type FastifyInstance, type InjectOptions } from 'fastify';
import { type RegisterRequest } from '@hanji/schemas';

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;
type TestClientRequestOptions = InjectOptions & {
  /**
   * Overrides the default Origin header.
   * Use null to omit the header entirely.
   */
  origin?: string | null;
};

const REGISTER_URL = '/api/v1/auth/register';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class TestClient {
  private cookies: Record<string, string> = {};

  constructor(
    private app: FastifyInstance,
    private webOrigin: string
  ) {}

  async request(options: TestClientRequestOptions): Promise<InjectResponse> {
    const { origin, ...injectOptions } = options;
    const method = (injectOptions.method ?? 'GET').toUpperCase();

    const headers: NonNullable<InjectOptions['headers']> = {
      ...injectOptions.headers,
    };

    const hasHeader = (name: string) =>
      Object.keys(headers).some((key) => key.toLowerCase() === name);

    if (hasHeader('origin')) {
      throw new Error('Specify Origin using the "origin" option, not headers.');
    }

    if (hasHeader('cookie')) {
      throw new Error('TestClient manages cookies automatically; do not supply a cookie header.');
    }

    if (!SAFE_METHODS.has(method) || origin !== undefined) {
      if (origin !== null) {
        headers['origin'] = origin ?? this.webOrigin;
      }
    }

    if (Object.keys(this.cookies).length > 0) {
      headers['cookie'] = Object.entries(this.cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    }

    const response = await this.app.inject({
      ...injectOptions,
      headers,
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

  /**
   * Register a user and keep the session cookie that registration sets.
   *
   * Successful registration already creates a session and issues the session
   * cookie, so no separate login request is needed. The returned client
   * is ready to make authenticated requests.
   */
  async registerAndLogin(input: RegisterRequest): Promise<InjectResponse> {
    const response = await this.request({
      method: 'POST',
      url: REGISTER_URL,
      payload: input,
    });

    if (response.statusCode !== 201) {
      throw new Error(`Registration failed: ${response.statusCode}`);
    }

    return response;
  }
}
