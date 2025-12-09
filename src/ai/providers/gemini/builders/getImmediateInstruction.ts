import { Mode } from "../../../../../types/mode";
import { OrderedListBuilder } from "../utils";

const getLanguageName = (locale: string) => (locale === 'uk' ? 'Ukrainian' : 'English');


export const getImmediateInstruction = (mode: Mode, locale: string) => {
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