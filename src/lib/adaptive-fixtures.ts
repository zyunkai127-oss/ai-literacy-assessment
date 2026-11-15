// Provisional benchmark labels for this fictional source pack; expert validation is still required.
import type { FollowUpOutcome } from './types';
const groups: [string, string, FollowUpOutcome, string[]][] = [
  ['weekly-calculation', 'basis-start', 'met', [
    'The week 8 survey records 27 weekly users among 48 respondents. 27 divided by 48 is about 56%, describing respondents rather than all 120 students.',
    'In the Module survey report, week 8, 27/48 gives roughly 56 per cent. The denominator is people who answered, not everyone enrolled.',
    'I would check the week 8 survey: twenty-seven of the forty-eight respondents use AI weekly, approximately 56%. It is a respondent percentage.',
  ]],
  ['wrong-denominator', 'basis-start', 'not_met', [
    'The survey proves that 56% of all 120 enrolled students use AI weekly. I calculate it using 120 as the denominator.',
    'It means 56 per cent of the entire cohort; I divide 27 by 120 to get it.',
    'I would use the total enrolment of 120 underneath the 27 weekly users. That gives 56% for all students.',
  ]],
  ['quiz-scope', 'basis-deepen', 'met', [
    'The quiz averages cover survey respondents only, not all 120 enrolled students. Non-respondents may differ, limiting generalisation.',
    'Only those answering the survey are represented. The missing 72 students could have different results, so the whole module is not established.',
    'These are respondent-group means; they exclude non-respondents. Selection into the survey limits extending the comparison to the cohort.',
  ]],
  ['missing-calculation', 'basis-start', 'not_met', [
    '56% is the weekly share.', 'The percentage is fifty-six.', 'It says that people use AI weekly, with a figure of 56%.',
  ]],
  ['non-random-design', 'uncertainty-start', 'met', [
    'Weekly users scored three points more, but this is an association. The method note says groups were not randomly assigned, so it cannot isolate an AI effect.',
    'The quiz shows a difference, not that AI caused it: people selected their own AI use rather than being randomly allocated.',
    'The observed group gap is not causal evidence because this was observational and the groups were self-selected, according to the method note.',
  ]],
  ['attendance-confounder', 'uncertainty-start', 'met', [
    'The gap is associated with weekly use, but weekly users attended more seminars, 7.1 versus 5.4. Attendance could explain it, so AI causation is not established.',
    'We observe higher quiz means among weekly users. The method note also reports different attendance, an alternative explanation that prevents isolating AI as the cause.',
    'Calling this proof that AI helps learning would be too strong. Weekly users attended more seminars, so the three-point difference may reflect attendance.',
  ]],
  ['causal-overclaim', 'uncertainty-start', 'not_met', [
    'The three extra points prove that AI causes better learning.', 'AI certainly improves learning because its users scored higher.', 'This gap establishes a causal benefit from AI, without any other explanation needed.',
  ]],
  ['unsupported-slogan', 'uncertainty-start', 'not_met', [
    'Correlation is not causation.', 'We cannot say for sure; more research is needed.', 'AI might help or might not. We should be careful.',
  ]],
  ['personal-choice', 'selection-start', 'met', [
    'I kept the quiz comparison but removed the causal wording because the method note says groups were not randomly assigned.',
    'For my brief, the numerical gap stays while a causal claim is excluded: the observational design cannot isolate AI.',
    'My choice was to report the observed difference and qualify it, since attendance differed between the groups in the quiz note.',
  ]],
  ['hypothetical-choice', 'selection-start', 'not_met', [
    'If someone wrote this brief, they might keep the comparison because it is interesting. I have not chosen anything yet.',
    'A possible student could remove a causal claim because the data are observational; that is hypothetical, not a decision I made.',
    'Someone might choose a statistic from the survey. I am only describing a possibility, with no personal choice.',
  ]],
  ['agreement-only', 'selection-specific', 'not_met', [
    'Yes, I agree.', 'That sounds fine.', 'I will do that.',
  ]],
  ['unresolved-referents', 'selection-start', 'unclear', [
    'I kept that one for the reason about the other thing.', 'The other part stays because of what it said there.', 'I changed it for that reason; by it I mean the thing mentioned before.',
  ]],
];
export const ADAPTIVE_FIXTURES = groups.flatMap(([name, questionId, expected, answers]) => answers.map((answer, i) => ({ id: `${name}-${i + 1}`, name, questionId, expected, answer })));
