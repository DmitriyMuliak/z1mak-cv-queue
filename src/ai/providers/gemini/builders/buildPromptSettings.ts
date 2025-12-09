import { Mode } from "../../../../../types/mode";
import { getImmediateInstruction } from "./getImmediateInstruction";
import { getSystemInstructions } from "./getSystemInstructions";
import { getTaskContext } from "./getTaskContext";

interface BuildPromptSettingsParams {
  cvDescription: string;
  jobDescription?: string;
  options: BuildPromptSettingsOptions;
}

interface BuildPromptSettingsOptions {
  mode: Mode;
  locale: string;
}

export const buildPromptSettings = ({
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
