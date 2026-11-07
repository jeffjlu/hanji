import { type FastifyInstance, type InjectOptions } from 'fastify';
import { type RegisterRequest } from '@hanji/schemas';

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

const REGISTER_URL = '/api/v1/auth/register';

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
