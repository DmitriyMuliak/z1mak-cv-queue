import { produce } from 'immer';
import { Schema, Type } from '@google/genai';
import { PROPERTY_DEFINITIONS, amountPlaceholder } from './propertyDefinitions';
import type { Mode } from '../../../types/mode';
import { isByJob, isCommonDomain, isDeep, isHardMode } from '../../utils/mode';

export class SchemaService {
  private mode: Mode;
  private readonly commonDomain: boolean;
  private readonly byJob: boolean;
  private readonly deep: boolean;
  private readonly hardMode: boolean;

  constructor(mode: Mode) {
    this.mode = mode;
    this.commonDomain = isCommonDomain(mode);
    this.byJob = isByJob(mode);
    this.deep = isDeep(mode);
    this.hardMode = isHardMode(mode);
  }

  private get includeSkills() {
    return this.hardMode;
  }

  private get includeExperience() {
    return this.byJob;
  }

  private get includeQuestions() {
    return this.hardMode;
  }

  private get includeImprovements() {
    return this.deep;
  }

  private buildOverallAnalysis(): Schema {
    const props: Record<string, Schema> = {
      candidateLevel: PROPERTY_DEFINITIONS.overallAnalysis.candidateLevel,
      suitabilitySummary: PROPERTY_DEFINITIONS.overallAnalysis.suitabilitySummary,
    };
    const required = Object.keys(props);

    if (this.commonDomain) {
      props.independentCvScore = PROPERTY_DEFINITIONS.overallAnalysis.independentCvScore;
    } else {
      props.independentTechCvScore =
        PROPERTY_DEFINITIONS.overallAnalysis.independentTechCvScore;
    }

    if (this.byJob) {
      props.matchScore = PROPERTY_DEFINITIONS.overallAnalysis.matchScore;
      props.jobTargetLevel = PROPERTY_DEFINITIONS.overallAnalysis.jobTargetLevel;
      props.levelMatch = PROPERTY_DEFINITIONS.overallAnalysis.levelMatch;
      required.push('jobTargetLevel', 'levelMatch');

      if (this.deep) {
        props.educationMatch = PROPERTY_DEFINITIONS.overallAnalysis.educationMatch;
        props.jobHoppingFlag = PROPERTY_DEFINITIONS.overallAnalysis.jobHoppingFlag;
        required.push('educationMatch', 'jobHoppingFlag');
      }
    } else {
      // General mode logic
      props.jobHoppingFlag = PROPERTY_DEFINITIONS.overallAnalysis.jobHoppingFlag;
      required.push('jobHoppingFlag');
    }

    return { type: Type.OBJECT, properties: props, required };
  }

  private buildQuantitativeMetrics(): Schema {
    const props: Record<string, Schema> = {
      totalYearsInCV: PROPERTY_DEFINITIONS.quantitativeMetrics.totalYearsInCV,
    };
    const required = Object.keys(props);

    if (this.byJob) {
      props.relevantYearsInCV =
        PROPERTY_DEFINITIONS.quantitativeMetrics.relevantYearsInCV;
      props.keySkillCoveragePercent =
        PROPERTY_DEFINITIONS.quantitativeMetrics.keySkillCoveragePercent;
      props.requiredYearsInJob =
        PROPERTY_DEFINITIONS.quantitativeMetrics.requiredYearsInJob;
      required.push('requiredYearsInJob');
    }

    if (this.deep) {
      props.stackRecencyScore =
        PROPERTY_DEFINITIONS.quantitativeMetrics.stackRecencyScore;
      props.softSkillsScore = PROPERTY_DEFINITIONS.quantitativeMetrics.softSkillsScore;
      required.push('stackRecencyScore', 'softSkillsScore');
    }

    return { type: Type.OBJECT, properties: props, required };
  }

  private buildImprovementPlan(): Schema {
    const props: Record<string, Schema> = {
      title: { type: Type.STRING },
      summaryRewrite: PROPERTY_DEFINITIONS.improvementComponents.summaryRewrite as Schema,
      quantifyAchievements: PROPERTY_DEFINITIONS.improvementComponents
        .quantifyAchievements as Schema,
      removeIrrelevant: PROPERTY_DEFINITIONS.improvementComponents
        .removeIrrelevant as Schema,
    };
    const required = Object.keys(props);

    if (this.byJob) {
      props.keywordOptimization = PROPERTY_DEFINITIONS.improvementComponents
        .keywordOptimization as Schema;
      required.push('keywordOptimization');
    }

    return { type: Type.OBJECT, properties: props, required };
  }

  public getGenAiSchema(): Schema {
    const properties: Record<string, Schema> = {
      analysisTimestamp: {
        type: Type.STRING,
        description: 'Current ISO date and time',
      },
      overallAnalysis: this.buildOverallAnalysis(),
      quantitativeMetrics: this.buildQuantitativeMetrics(),
      redFlagsAndConcerns: PROPERTY_DEFINITIONS.redFlagsAndConcerns as Schema,
      metadata: PROPERTY_DEFINITIONS.metadata as Schema,
    };

    if (this.includeImprovements) {
      properties.actionableImprovementPlan = this.buildImprovementPlan();
    }

    // Conditional Top-Level Sections
    if (this.includeSkills) {
      const updatedDefinitions = produce(PROPERTY_DEFINITIONS, (draft) => {
        const skills = draft.detailedSkillAnalysis.properties.skills;
        if (this.deep) {
          skills.maxItems = skills.maxItems.replace(amountPlaceholder, '7');
        } else {
          skills.maxItems = skills.maxItems.replace(amountPlaceholder, '4');
        }
      });
      properties.detailedSkillAnalysis =
        updatedDefinitions.detailedSkillAnalysis as Schema;
    }

    if (this.includeQuestions) {
      properties.suggestedInterviewQuestions =
        PROPERTY_DEFINITIONS.suggestedInterviewQuestions as Schema;
    }

    if (this.includeExperience) {
      const updatedDefinitions = produce(PROPERTY_DEFINITIONS, (draft) => {
        const jobsProp = draft.experienceRelevanceAnalysis.properties.jobs;
        if (this.deep) {
          jobsProp.maxItems = jobsProp.maxItems.replace(amountPlaceholder, '5');
        } else {
          jobsProp.maxItems = jobsProp.maxItems.replace(amountPlaceholder, '3');
        }
      });
      properties.experienceRelevanceAnalysis =
        updatedDefinitions.experienceRelevanceAnalysis as Schema;
    }

    return {
      type: Type.OBJECT,
      properties,
      required: Object.keys(properties),
    };
  }
}

export type UiSectionKey =
  | 'header'
  | 'skills'
  | 'experience'
  | 'redFlags'
  | 'improvements'
  | 'questions';
