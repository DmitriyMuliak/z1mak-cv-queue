import { Mode } from "../../../../../types/mode";

export const getTaskContext = (mode: Mode) => {
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