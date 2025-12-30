import { Type, Static } from '@sinclair/typebox';

export const WorkerConcurrencySchema = Type.Object(
  {
    queue: Type.Union([Type.Literal('lite'), Type.Literal('hard')]),
    concurrency: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false }
);

export type WorkerConcurrencyBody = Static<typeof WorkerConcurrencySchema>;
