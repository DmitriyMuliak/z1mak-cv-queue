import Fastify from 'fastify';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('get-jwks');
import GetJwks from 'get-jwks';

const SUPABASE_REF = 'proj';
const kid = 'test-kid';
const alg = 'HS256';
const SHARED_SECRET: jwt.Secret = 'test-secret';

const signToken = (
  payload: Record<string, unknown> = {},
  header: Record<string, unknown> = {}
) =>
  jwt.sign({ sub: 'user-1', ...payload }, SHARED_SECRET, {
    algorithm: alg,
    keyid: header.kid ?? kid,
    header: { alg, kid, ...header },
  } as jwt.SignOptions);

const signTokenWithoutKid = () =>
  jwt.sign({ sub: 'user-1' }, SHARED_SECRET, {
    algorithm: alg,
    header: { alg },
  } as jwt.SignOptions);

const buildApp = async () => {
  const app = Fastify({ logger: false });
  const { default: authPlugin } = await import('../../../src/plugins/auth');
  await app.register(authPlugin);
  app.get('/protected', { preHandler: app.authenticate }, (req) => ({
    sub: req.user?.sub,
  }));
  return app;
};

describe('auth plugin', () => {
  let getPublicKey: Mock;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.resetAllMocks();
    getPublicKey = vi.fn().mockResolvedValue(SHARED_SECRET);
    (GetJwks as unknown as Mock).mockReturnValue({ getPublicKey });
    process.env.SUPABASE_PROJECT_REF = SUPABASE_REF;
    app = await buildApp();
  });

  it('verifies JWT via JWKS and attaches user', async () => {
    // const app = await buildApp();
    const expectedDomain = `https://${SUPABASE_REF}.supabase.co/auth/v1`;

    const token = signToken();
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sub: 'user-1' });

    expect(getPublicKey).toHaveBeenCalledWith({ domain: expectedDomain, alg, kid });
  });

  it('returns error when kid or alg missing', async () => {
    // RS token without kid
    const badToken = signTokenWithoutKid();

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${badToken}` },
    });

    expect(res.statusCode).toBe(500); // secret getter throws
    expect(res.body).toContain('JWT header is missing');
  });

  it('responds 401 on invalid signature', async () => {
    // Corrupt signature
    const token = signToken().replace(/.$/, 'x');

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message || res.body).toMatch(/signature|invalid/i);
  });
});
