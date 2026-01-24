import '@fastify/jwt';

interface SupabaseJwtPayload {
  sub: string; // user UUID
  iss: string; // Issuer (who produce)
  exp: number; // Expiration time
  app_metadata: {
    provider?: string;
    role: 'user' | 'admin'; // Custom roles
    [key: string]: unknown;
  };
  user_metadata: {
    [key: string]: unknown;
  };
  role: string; // Technical Postgres role ('authenticated')
  [key: string]: unknown;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SupabaseJwtPayload; // decoded token payload
    user: SupabaseJwtPayload; // request.user
    header: {
      alg: string;
      kid: string;
      [key: string]: unknown;
    };
  }
}
