import fp from 'fastify-plugin';
import fastifyJwt, { JwtHeader, TokenOrHeader } from '@fastify/jwt';
import GetJwks from 'get-jwks';
import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

// get-jwks will call /.well-known/jwks.json`;
const SUPABASE_DOMAIN = `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co/auth/v1`;

export default fp(async (fastify) => {
  const getJwks = GetJwks({
    max: 100,
    // Docs recommend not caching too long to allow key revocation.
    // Edge caches for 10 mins, so 15 mins is a safe balance.
    ttl: 15 * 60 * 1000,
    issuersWhitelist: [SUPABASE_DOMAIN],
  });

  fastify.register(fastifyJwt, {
    decode: { complete: true },

    secret: async (_request: FastifyRequest, rawToken: TokenOrHeader) => {
      // Library TS gap - header depends on decode option,
      // but TS doesn't infer it automatically from config.
      const header: JwtHeader = 'header' in rawToken ? rawToken.header : rawToken;
      const { kid, alg } = header;

      if (!kid || !alg) {
        throw new Error(`JWT header is missing ${!kid ? 'kid' : 'alg'}`);
      }

      return getJwks.getPublicKey({
        domain: SUPABASE_DOMAIN,
        alg,
        kid,
      });
    },
  });

  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest) {
      await request.jwtVerify();
    }
  );
});
