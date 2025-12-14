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
    userId: Type.String({ minLength: 1 }),
    role: Type.Union([Type.Literal('user'), Type.Literal('admin')]),
    payload: Type.Object(
      {
        cvDescription: Type.String({ minLength: 1 }),
        jobDescription: Type.Optional(Type.String({ minLength: 1 })),
        mode: ModeSchema,
        locale: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false }
    ),
  },
  { additionalProperties: false }
);

export const JobIdParamsSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false }
);

export type RunAiJobBody = Static<typeof RunAiJobBodySchema>;
export type JobIdParams = Static<typeof JobIdParamsSchema>;
