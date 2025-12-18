import Fastify from 'fastify';
import type { Mode } from '../../../src/types/mode';

const app = Fastify({ logger: false });

type MockConfig = {
  mode: 'success' | 'fail';
  status: number;
  text: string;
  delayMs: number;
};

type RequestBody = {
  model: string;
  cvDescription: string;
  jobDescription?: string;
  mode: Mode;
  locale: string;
};

const config: MockConfig = {
  mode: 'success',
  status: 500,
  text: 'mocked gemini text',
  delayMs: 0,
};

app.get('/health', async (_request, reply) => {
  reply.send({ status: 'ok' });
});

app.post('/__config', async (request, reply) => {
  const body = (request.body ?? {}) as Partial<MockConfig>;

  if (body.mode && body.mode !== 'success' && body.mode !== 'fail') {
    return reply.code(400).send({ error: 'Invalid mode' });
  }

  config.mode = body.mode ?? config.mode;
  config.status = body.status ?? config.status;
  config.text = body.text ?? config.text;
  config.delayMs = body.delayMs ?? config.delayMs;

  return reply.send({ ok: true, config });
});

app.post('/', async (request, reply) => {
  const body = request.body as RequestBody;

  if (config.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, config.delayMs));
  }

  if (config.mode === 'fail') {
    return reply.code(config.status).send({ error: 'Mock failure' });
  }

  return reply.send({
    text: `${config.text} for ${body.model}`,
  });
});

const port = Number(process.env.PORT ?? 8080);

const start = app.listen({ port, host: '0.0.0.0' });

start
  .then(() => {
    console.log(`Mock Gemini listening on ${port}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

const shutdown = async () => {
  try {
    await app.close();
  } catch (err) {
    console.error('Mock Gemini shutdown error', err);
  } finally {
    process.exit(0);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
