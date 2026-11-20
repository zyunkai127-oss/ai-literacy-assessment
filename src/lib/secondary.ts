import type { EvidenceFeedback } from './assessment-scoring';
import type { Msg } from './types';

export const essayPrompt = 'Many people are drawn to dramatic moments. We often hear that scientific discoveries come from a long, complicated process of careful work by many people. Yet many of us would rather believe the story of Newton discovering the law of gravity after an apple hit him on the head, or of Archimedes discovering the principle of buoyancy as he got into a bath. This preference shows up in many areas of life and can shape how we think and act.';
export const essayQuestion = 'What thoughts does this bring to mind? Write a short essay in response.';
export const windQuestion = 'Which of the four sites would you recommend for a wind farm? Use the wind-speed graphs to explain your choice and compare it with one other site.';
export const windEvidence = [
  'A starts above 30 km/h, drops close to zero in the middle of the year and rises again towards December.',
  'B has two sharp peaks above 30 km/h. Wind speeds are much lower for much of the year.',
  'C stays fairly close to 30 km/h throughout the year, with modest variations.',
  'D stays below 30 km/h all year, with two modest rises.'
];
export type Stage = 'draft' | 'revision' | 'science' | 'feedback';
export interface Assessment {
  ratings?: Ratings;
  feedback?: EvidenceFeedback;
  windPack?: 2;
  stage: Stage;
  version: number;
  draft: string;
  revision: string;
  science: string;
  discussion: Msg[];
  comparison: Msg[];
}
export function newAssessment(): Assessment {
  return { windPack: 2, stage: 'draft', version: 0, draft: '', revision: '', science: '', discussion: [], comparison: [] };
}

export const dimensions = {
  effective: 'Effective use',
  critical: 'Critical use',
  responsible: 'Responsible use',
  bonus: 'Bonus · Managing AI'
};
type TaskFeedback = {
  detail: string;
  quote: string;
  draftQuote?: string;
  revisionQuote?: string;
};
export type Rating = {
  level: 'Great' | 'Fair' | 'Need Work' | 'Not enough evidence';
  comment: string;
  next?: string;
  tasks?: Record<'essay' | 'science', TaskFeedback>;
};
export type Ratings = Record<keyof typeof dimensions, Rating>;
