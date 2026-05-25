import type { RuleAdherence } from '@/models/journal';

import { defaultDisciplineScoreSettings, type DisciplineScoreSettings } from '../data/journal-repository';

const negativeEmotionFallback = ['stressed', 'frustrated', 'greedy', 'fearful', 'tired', 'anxious'];

export type DisciplineInput = {
  adherence: RuleAdherence;
  emotionBefore: string;
  emotionAfter?: string;
  ruleViolations: string[];
  settings?: DisciplineScoreSettings;
};

export function buildDisciplineSnapshot({
  adherence,
  emotionBefore,
  emotionAfter,
  ruleViolations,
  settings = defaultDisciplineScoreSettings,
}: DisciplineInput) {
  const negativeEmotions = new Set([...negativeEmotionFallback, ...settings.negativeEmotions]);
  const emotionalFlags = [emotionBefore, emotionAfter]
    .filter((emotion): emotion is string => Boolean(emotion && negativeEmotions.has(emotion)));
  let score = 100;

  score -= settings.adherenceDeductions[adherence] ?? 0;
  score -= emotionalFlags.length * settings.negativeEmotionDeduction;
  score -= ruleViolations.length * settings.ruleViolationDeduction;

  return {
    score: Math.max(0, score),
    emotionalFlags,
    recalculationInputs: {
      adherence,
      emotionBefore,
      emotionAfter,
      ruleViolationCount: ruleViolations.length,
    },
  };
}
