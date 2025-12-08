import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai';
import { SchemaService } from '../schema/SchemaService';
import type { Mode } from '../../../types/mode';

export interface GeminiRequest {
  model: string;
  cvDescription: string;
  jobDescription?: string;
  mode: Mode;
  locale: string;
}

export class GeminiProvider {
  private client: GoogleGenAI;

  constructor(
    apiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY
  ) {
    if (!apiKey) {
      throw new Error('Gemini API key is missing');
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate({
    model,
    cvDescription,
    jobDescription,
    mode,
    locale,
  }: GeminiRequest): Promise<string> {
    const promptSettings = buildPromptSettings({
      cvDescription,
      jobDescription,
      options: { mode, locale },
    });

    const responseSchema = new SchemaService(mode).getGenAiSchema();

    try {
      const result = await this.client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text: promptSettings.prompt }],
          },
        ],
        config: {
          systemInstruction: promptSettings.systemInstructions,
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema,
          safetySettings,
        },
      });

      return result.text ?? '';
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  private normalizeError(error: unknown): Error {
    const status = this.extractStatus(error);

    if (status === 429) {
      const err = new Error('Gemini rate limit exceeded');
      (err as any).status = 429;
      return err;
    }

    if (status === 503) {
      const err = new Error('Gemini service unavailable');
      (err as any).status = 500;
      return err;
    }

    if (typeof status === 'number') {
      const err = new Error((error as Error)?.message ?? 'Gemini provider error');
      (err as any).status = status;
      return err;
    }

    return error instanceof Error ? error : new Error('Unknown Gemini provider error');
  }

  private extractStatus(error: unknown): number | undefined {
    if (!error) return undefined;

    const maybeObj = error as any;
    if (typeof maybeObj.status === 'number') return maybeObj.status;
    if (typeof maybeObj.code === 'number') return maybeObj.code;
    if (typeof maybeObj?.error?.code === 'number') return maybeObj.error.code;
    if (typeof maybeObj?.response?.status === 'number') return maybeObj.response.status;

    return undefined;
  }
}

interface BuildPromptSettingsParams {
  cvDescription: string;
  jobDescription?: string;
  options: BuildPromptSettingsOptions;
}

interface BuildPromptSettingsOptions {
  mode: Mode;
  locale: string;
}

const buildPromptSettings = ({
  cvDescription,
  jobDescription,
  options,
}: BuildPromptSettingsParams) => {
  const { mode } = options;
  const isByJob = mode.evaluationMode === 'byJob';

  let inputDataBlock = `<CV_TEXT>\n${cvDescription}\n</CV_TEXT>`;

  if (isByJob) {
    inputDataBlock += `\n\n<JOB_DESCRIPTION>\n${jobDescription}\n</JOB_DESCRIPTION>`;
  }

  return {
    prompt: `
    <TASK_CONTEXT>
      ${getTaskContext(mode)}
    </TASK_CONTEXT>

    <INPUT_DATA>
      ${inputDataBlock}
    </INPUT_DATA>

    <IMMEDIATE_INSTRUCTION>
      ${getImmediateInstruction(mode, options.locale)}
    </IMMEDIATE_INSTRUCTION>
    `,
    systemInstructions: getSystemInstructions(mode),
  };
};

const getTaskContext = (mode: Mode) => {
  const { evaluationMode, domain } = mode;

  if (evaluationMode === 'byJob') {
    return domain === 'it'
      ? 'Conduct a technical comparative analysis of an IT candidate against a vacancy.'
      : 'Conduct a professional comparative analysis of a candidate against a job description.';
  }

  return domain === 'it'
    ? 'Conduct a comprehensive technical audit of an IT resume based on global market standards (FAANG/Big Tech).'
    : 'Conduct a general professional review of a resume to identify strengths, weaknesses, and structure improvements.';
};

const getSystemInstructions = (mode: Mode) => {
  const { evaluationMode, domain } = mode;

  if (domain === 'it') {
    const basePersona = `You are an elite AI Talent Analyst and Technical Recruiter with 20 years of experience in the IT industry (FAANG level).`;

    if (evaluationMode === 'byJob') {
      return `
        ${basePersona}
        Your task is to conduct a deep and ruthlessly honest analysis of the provided CV against the Job Description.
        
        Your principles:
        1. Be ruthlessly honest. Do not sugarcoat the truth.
        2. Act as a data-driven analyst.
        3. Carefully compare vacancy requirements with facts in the resume. Focus on Tech Stack match.
        4. Always respond in JSON format according to the provided schema.
      `;
    }

    return `
      ${basePersona}
      Your task is to audit the provided CV based on current global IT market standards.
      
      Your principles:
      1. Evaluate the candidate's seniority based on the complexity of described projects and stack.
      2. Identify "Red Flags" typical for IT (job hopping, outdated stack, lack of achievements).
      3. Be critical about vague descriptions.
      4. Always respond in JSON format according to the provided schema.
    `;
  }

  const basePersona = `You are a Senior HR Business Partner and Career Coach with extensive experience in hiring for various industries.`;

  if (evaluationMode === 'byJob') {
    return `
      ${basePersona}
      Your task is to determine if the candidate is a good fit for the specific role described.
      
      Your principles:
      1. Focus heavily on Soft Skills, Transferable Skills, and relevant industry experience.
      2. Analyze the cultural fit implied in the Job Description.
      3. Check if the candidate's achievements are quantified (STAR method).
      4. Always respond in JSON format.
    `;
  }

  return `
    ${basePersona}
    Your task is to review the CV to maximize the candidate's employability.
    
    Your principles:
    1. Focus on the clarity, structure, and formatting of the CV.
    2. Identify weak verbs and lack of results/numbers.
    3. Suggest improvements to make the profile stand out.
    4. Always respond in JSON format.
  `;
};

const getImmediateInstruction = (mode: Mode, locale: string) => {
  const { evaluationMode, domain, depth } = mode;
  const builder = new OrderedListBuilder();

  const langName = getLanguageName(locale);
  builder.add(`Adhere to the rules and persona described in the system prompt.`);
  builder.add(`Analyze the input data and populate the output JSON structure.`);
  builder.add(
    `Write the answer in ${langName} language, but DO NOT translate specific domain terminology (keep tech stack/role names in English).`
  );
  builder.add(
    `If CV in <CV_TEXT> have no sense (maybe it's empty or contain only random string), you can skip analyzing at all and return empty strings, empty arrays, 0 for numbers`
  );

  if (evaluationMode === 'byJob') {
    builder.add(
      `Read <CV_TEXT> and identify all matches and gaps compared to <JOB_DESCRIPTION>.`
    );

    if (domain === 'it') {
      builder.add(
        `Verify if the candidate knows the specific versions or ecosystem tools mentioned in the vacancy.`
      );
    } else {
      builder.add(`Focus on experience relevance and soft skills requirements.`);
    }

    builder.add(
      `For "missingKeywords", look for actual discrepancies between the Job Description and the CV.`
    );
  } else {
    builder.add(
      `Evaluate the candidate based on the implied role title found in the CV header.`
    );

    builder.add(`Focus on "Actionable Improvement Plan" to make this CV market-ready.`);
  }

  const isDeep = depth === 'deep';
  const isHardMode = evaluationMode === 'byJob' && isDeep;

  if (isHardMode) {
    builder.add(
      `Provide a detailed "detailedSkillAnalysis" parsing every skill mentioned.`
    );

    builder.add(
      `Generate "suggestedInterviewQuestions" to probe the identified weak spots.`
    );
  } else {
    builder.add(`Provide a high-level summary without deep granular skill breakdown.`);
  }

  builder.add(
    `PAY ATTENTION TO FIELD DESCRIPTIONS: If "be honest" is specified - do not sugarcoat. If a number is required, provide 0 if not found.`
  );

  return builder.getList().join('\n');
};

const getLanguageName = (locale: string) => (locale === 'uk' ? 'Ukrainian' : 'English');

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

class OrderedListBuilder {
  private count = 1;
  private list: string[] = [];

  add(text: string): void {
    this.list.push(`${this.count++}. ${text}`);
  }

  getList(): string[] {
    return this.list;
  }

  reset(): void {
    this.count = 1;
    this.list = [];
  }
}
