import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';

const mockAuth = fp(async (fastify) => {
  fastify.decorate('authenticate', async (req: FastifyRequest) => {
    // optionally parse headers for RLS/withUserContext
    const userId = (req.headers['x-test-user'] as string) ?? 'test-user';
    const role = (req.headers['x-test-role'] as string) ?? 'authenticated';
    const userRole =
      (req.headers['x-test-user-role'] as 'admin' | 'user') ?? ('user' as const);

    const user = {
      sub: userId,
      role,
      email: `${userId}@test.local`,
      iss: 'test iss',
      exp: Date.now(),
      app_metadata: { role: userRole },
      user_metadata: { name: 'Test User' },
    };

    req.user = user;
  });
});

// Point to the compiled auth plugin that the app imports (dist/src/plugins/auth.js).
const authPath = require.resolve('../../../../src/plugins/auth');

const mockModule: NodeJS.Module = {
  id: authPath,
  filename: authPath,
  loaded: true,
  children: [],
  paths: [],
  exports: mockAuth,
  parent: null, // or require.main and module.children instead.
  path: authPath,
  require: module.require.bind(module),
  isPreloading: false,
};

require.cache[authPath] = mockModule;
