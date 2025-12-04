import { Type } from '@google/genai';

// #EnumInArrays (maxItems, maxLength, .etc)
// Enum in Array can produce 400 INVALID_ARGUMENT "constraint that has too many states")
// Google Gemini (Controlled Generation) try to build (Finite State Machine) a lot of variants (more than it can handle)
export const amountPlaceholder = '[amount]';
export const PROPERTY_DEFINITIONS = {
  overallAnalysis: {
    matchScore: {
      type: Type.NUMBER,
      description:
        'Number from 0 to 100. Assessment of how well the CV matches the vacancy. 0 - no match, 100 - perfect candidate.',
    },
    independentCvScore: {
      type: Type.NUMBER,
      description:
        'Number 0-100. Evaluate the overall quality of the CV structure and content, independent of the vacancy. Focus on: formatting, readability, use of Action Verbs, quantification of results (numbers/metrics), and clarity. 0 = poor/unusable, 100 = perfect, market-ready CV.',
    },
    independentTechCvScore: {
      type: Type.NUMBER,
      description:
        "Number 0-100. Assessment of the resume's strength based on global recruitment standards. Factors: strong impact statements (STAR method), measurable achievements, absence of 'water', and modern layout. High score means the candidate sells themselves effectively.",
    },
    candidateLevel: {
      type: Type.STRING,
      format: 'enum',
      enum: ['Junior', 'Middle', 'Senior', 'Lead', 'Principal'],
      description: 'Assess the candidate level based on the CV',
    },
    jobTargetLevel: {
      type: Type.STRING,
      format: 'enum',
      enum: ['Junior', 'Middle', 'Senior', 'Lead', 'Principal'],
      description: 'Assess the level of the vacancy itself',
    },
    levelMatch: {
      type: Type.BOOLEAN,
      description: 'true or false, do the candidate and vacancy levels match?',
    },
    suitabilitySummary: {
      type: Type.STRING,
      // maxLength: '420',
      description:
        'Short (3-4 sentences) summary: why the candidate fits or does not fit. Be honest.',
    },
    educationMatch: {
      type: Type.BOOLEAN,
      description: 'boolean. Does the education in the CV meet the vacancy requirements?',
    },
    jobHoppingFlag: {
      type: Type.BOOLEAN,
      description:
        "boolean. Are there signs of 'job hopping' (less than 1.5-2 years in the last 3+ positions)?",
    },
  },
  quantitativeMetrics: {
    totalYearsInCV: {
      type: Type.NUMBER,
      description: 'Number. Total work experience found in the CV (e.g., 8.5)',
    },
    relevantYearsInCV: {
      type: Type.NUMBER,
      description: 'Number. Work experience relevant to THIS vacancy',
    },
    requiredYearsInJob: {
      type: Type.NUMBER,
      description: 'Number. How many years of experience the vacancy requires (0 if not specified)',
    },
    keySkillCoveragePercent: {
      type: Type.NUMBER,
      description:
        'Number from 0 to 100. What percentage of REQUIRED skills from the vacancy were found in the CV?',
    },
    stackRecencyScore: {
      type: Type.NUMBER,
      description:
        "Number 0-100. How 'fresh' are the necessary skills? 100 - used the main stack at the current job, 0 - used long ago.",
    },
    softSkillsScore: {
      type: Type.NUMBER,
      description:
        'Number 0-100. How clearly expressed are the necessary Soft Skills (communication, leadership) in the text?',
    },
  },

  detailedSkillAnalysis: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      skills: {
        type: Type.ARRAY,
        description: `List of key skills found in the CV. Prioritize skills that are most relevant to the vacancy/role. Order by importance from high to low. STRICTLY: Do not include skills that are not explicitly mentioned in the CV text.`,
        maxItems: `${amountPlaceholder}`,
        items: {
          type: Type.OBJECT,
          properties: {
            skill: { type: Type.STRING, description: "Skill name (e.g., 'Node.js')" },
            type: {
              type: Type.STRING,
              // #EnumInArrays
              // format: 'enum',
              // enum: ['Required', 'Desired'],
              description: "'Required' or 'Desired'",
            },
            status: {
              type: Type.STRING,
              // #EnumInArrays
              // format: 'enum',
              // enum: ['Strongly Present', 'Mentioned', 'Inferred', 'Missing'],
              description: "'Strongly Present' or 'Mentioned' or 'Inferred' or 'Missing'",
            },
            evidenceFromCV: {
              type: Type.STRING,
              description:
                "STRICTLY: A comma-separated list of Company Names where the skill was demonstrated, or 'N/A'.",
            },
            confidenceScore: { type: Type.NUMBER, description: 'Number 0-10' },
          },
          required: ['skill', 'type', 'status', 'evidenceFromCV', 'confidenceScore'],
        },
      },
    },
    required: ['title', 'skills'],
  },

  experienceRelevanceAnalysis: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      jobs: {
        type: Type.ARRAY,
        description: `Select the most recent and relevant positions. Prioritize experience that matches the vacancy requirements. Order by relevance (most relevant first).`,
        maxItems: `${amountPlaceholder}`,
        items: {
          type: Type.OBJECT,
          properties: {
            jobTitle: { type: Type.STRING },
            company: { type: Type.STRING },
            period: { type: Type.STRING },
            relevanceToRoleScore: { type: Type.NUMBER, description: 'Number 0-10' },
            comment: {
              type: Type.STRING,
              description:
                'Concise justification (1-2 sentences). Explain specific matches (tech stack, scale, domain) or why this experience is not relevant.',
            },
          },
          required: ['jobTitle', 'company', 'period', 'relevanceToRoleScore', 'comment'],
        },
      },
    },
    required: ['title', 'jobs'],
  },
  redFlagsAndConcerns: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      flags: {
        type: Type.ARRAY,
        maxItems: '5',
        items: {
          type: Type.OBJECT,
          properties: {
            concern: { type: Type.STRING },
            details: { type: Type.STRING },
            severity: {
              type: Type.STRING,
              // #EnumInArrays
              // format: 'enum',
              // enum: ['Low', 'Medium', 'High'],
              description: "'Low' or 'Medium' or 'High'",
            },
          },
          required: ['concern', 'details', 'severity'],
        },
      },
    },
    required: ['title', 'flags'],
  },
  suggestedInterviewQuestions: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      questions: {
        type: Type.ARRAY,
        description: `STRICT LIMIT: Provide a MAXIMUM of 5 questions. Focus on areas of concern, gaps, or opportunities for deeper understanding of the candidate's fit for the role.`,
        maxItems: '5',
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            reason: { type: Type.STRING },
          },
          required: ['question', 'reason'],
        },
      },
    },
    required: ['title', 'questions'],
  },
  improvementComponents: {
    summaryRewrite: {
      type: Type.OBJECT,
      properties: { suggestion: { type: Type.STRING }, example: { type: Type.STRING } },
      required: ['suggestion', 'example'],
    },
    keywordOptimization: {
      type: Type.OBJECT,
      properties: {
        missingKeywords: {
          type: Type.ARRAY,
          description: `STRICT LIMIT: List a MAXIMUM of 10 missing keywords.`,
          items: { type: Type.STRING },
        },
        suggestion: { type: Type.STRING },
      },
      required: ['missingKeywords', 'suggestion'],
    },
    quantifyAchievements: {
      type: Type.OBJECT,
      properties: {
        targetSection: { type: Type.STRING },
        suggestion: { type: Type.STRING },
        examplesToImprove: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['targetSection', 'suggestion', 'examplesToImprove'],
    },
    removeIrrelevant: {
      type: Type.OBJECT,
      properties: { suggestion: { type: Type.STRING } },
      required: ['suggestion'],
    },
  },
  metadata: {
    type: Type.OBJECT,
    properties: {
      isValidCv: {
        type: Type.BOOLEAN,
        description:
          'True if the CV text appears to be a valid resume containing professional experience or skills. False if it is empty, contains only random characters, or is clearly not a CV.',
      },
      isValidJobDescription: {
        type: Type.BOOLEAN,
        description:
          'True if the text describes a job role with requirements. False if it contains random characters, is too short to be meaningful  or is clearly not a Job Description.',
      },
      isJobDescriptionPresent: {
        type: Type.BOOLEAN,
        description: 'True if job description was provided.',
      },
    },
    required: ['isValidCv', 'isValidJobDescription', 'isJobDescriptionPresent'],
  },
};
