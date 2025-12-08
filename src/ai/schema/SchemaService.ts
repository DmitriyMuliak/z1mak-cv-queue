import { produce } from 'immer';
import { Schema, Type } from '@google/genai';
import { PROPERTY_DEFINITIONS, amountPlaceholder } from './propertyDefinitions';
import type { Mode } from '../../../types/mode';

export class SchemaService {
  private mode: Mode;

  constructor(mode: Mode) {
    this.mode = mode;
  }

  private get isCommonDomain() {
    return this.mode.domain === 'common';
  }

  private get isByJob() {
    return this.mode.evaluationMode === 'byJob';
  }

  private get isDeep() {
    return this.mode.depth === 'deep';
  }

  private get isHardMode() {
    return this.isByJob && this.isDeep;
  }

  private get includeSkills() {
    return this.isHardMode;
  }

  private get includeExperience() {
    return this.isByJob;
  }

  private get includeQuestions() {
    return this.isHardMode;
  }

  private get includeImprovements() {
    return this.isDeep;
  }

  private buildOverallAnalysis(): Schema {
    const props: Record<string, Schema> = {
      candidateLevel: PROPERTY_DEFINITIONS.overallAnalysis.candidateLevel,
      suitabilitySummary: PROPERTY_DEFINITIONS.overallAnalysis.suitabilitySummary,
    };
    const required = Object.keys(props);

    if (this.isCommonDomain) {
      props.independentCvScore = PROPERTY_DEFINITIONS.overallAnalysis.independentCvScore;
    } else {
      props.independentTechCvScore =
        PROPERTY_DEFINITIONS.overallAnalysis.independentTechCvScore;
    }

    if (this.isByJob) {
      props.matchScore = PROPERTY_DEFINITIONS.overallAnalysis.matchScore;
      props.jobTargetLevel = PROPERTY_DEFINITIONS.overallAnalysis.jobTargetLevel;
      props.levelMatch = PROPERTY_DEFINITIONS.overallAnalysis.levelMatch;
      required.push('jobTargetLevel', 'levelMatch');

      if (this.isDeep) {
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

    if (this.isByJob) {
      props.relevantYearsInCV =
        PROPERTY_DEFINITIONS.quantitativeMetrics.relevantYearsInCV;
      props.keySkillCoveragePercent =
        PROPERTY_DEFINITIONS.quantitativeMetrics.keySkillCoveragePercent;
      props.requiredYearsInJob =
        PROPERTY_DEFINITIONS.quantitativeMetrics.requiredYearsInJob;
      required.push('requiredYearsInJob');
    }

    if (this.isDeep) {
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

    if (this.isByJob) {
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
        if (this.isDeep) {
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
        if (this.isDeep) {
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
