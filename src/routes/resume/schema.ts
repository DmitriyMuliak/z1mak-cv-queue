import { Type, Static } from '@sinclair/typebox';

const ModeSchema = Type.Object(
  {
    evaluationMode: Type.Union([Type.Literal('general'), Type.Literal('byJob')]),
    domain: Type.Union([Type.Literal('it'), Type.Literal('common')]),
    depth: Type.Union([Type.Literal('standard'), Type.Literal('deep')]),
  },
  { additionalProperties: false }
);

export const RunAiJobBodySchema = Type.Object(
  {
    payload: Type.Object(
      {
        cvDescription: Type.String({ minLength: 1 }),
        jobDescription: Type.Optional(Type.String({ minLength: 1 })),
        mode: ModeSchema,
        locale: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false }
    ),
    streaming: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false }
);

export const JobIdParamsSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false }
);

export const UserIdParamsSchema = Type.Object(
  {
    userId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false }
);

export const RecentUserQuerySchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 40 })),
    offset: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false }
);

export const StreamJobBodySchema = Type.Object({
  lastEventId: Type.Optional(Type.String()),
});

export type RunAiJobBody = Static<typeof RunAiJobBodySchema>;
export type JobIdParams = Static<typeof JobIdParamsSchema>;
export type UserIdParams = Static<typeof UserIdParamsSchema>;
export type RecentUserQuery = Static<typeof RecentUserQuerySchema>;
export type StreamJobBody = Static<typeof StreamJobBodySchema>;
