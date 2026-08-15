/**
 * Curated intervention library — 10 issue → suggested-action mappings a
 * counselor can pick from when a pattern surfaces in a session. Bilingual;
 * the Arabic wording is the counselor-facing default, English shown when
 * the platform locale is `en`.
 *
 * The `tag` string is what the AI analyzer references — when Claude flags
 * a matching issue in a summary, the platform surfaces the corresponding
 * intervention card automatically.
 */

export type InterventionTag =
  | 'low_confidence'
  | 'social_isolation'
  | 'weak_communication'
  | 'weak_responsibility'
  | 'low_motivation'
  | 'anxiety_stress'
  | 'academic_weakness'
  | 'relationship_building'
  | 'talent_discovery'
  | 'weak_school_belonging';

export type Intervention = {
  tag: InterventionTag;
  emoji: string;
  issue: { ar: string; en: string };
  action: { ar: string; en: string };
};

export const INTERVENTIONS: readonly Intervention[] = [
  {
    tag: 'low_confidence',
    emoji: '🎙️',
    issue: { ar: 'ضعف الثقة بالنفس', en: 'Low self-confidence' },
    action: {
      ar: 'المشاركة في إذاعة أو تقديم فقرة أمام الطلاب.',
      en: 'Participate in school radio or present a segment in front of peers.',
    },
  },
  {
    tag: 'social_isolation',
    emoji: '👥',
    issue: { ar: 'العزلة الاجتماعية', en: 'Social isolation' },
    action: {
      ar: 'الانضمام لنشاط جماعي أو فريق طلابي.',
      en: 'Join a group activity or student team.',
    },
  },
  {
    tag: 'weak_communication',
    emoji: '🗣️',
    issue: { ar: 'ضعف التواصل', en: 'Weak communication' },
    action: {
      ar: 'المشاركة في نشاط حواري أو مناظرة.',
      en: 'Participate in a discussion activity or debate.',
    },
  },
  {
    tag: 'weak_responsibility',
    emoji: '🎯',
    issue: { ar: 'ضعف المسؤولية', en: 'Weak sense of responsibility' },
    action: {
      ar: 'تولي مهمة أو قيادة نشاط.',
      en: 'Take on a task or lead an activity.',
    },
  },
  {
    tag: 'low_motivation',
    emoji: '🚀',
    issue: { ar: 'ضعف الدافعية', en: 'Low motivation' },
    action: {
      ar: 'تحدي نفسه بهدف أسبوعي بسيط.',
      en: 'Set a simple weekly self-challenge goal.',
    },
  },
  {
    tag: 'anxiety_stress',
    emoji: '🧘',
    issue: { ar: 'التوتر', en: 'Anxiety / stress' },
    action: {
      ar: 'أنشطة رياضية أو فنية واسترخاء.',
      en: 'Sports, art, or relaxation activities.',
    },
  },
  {
    tag: 'academic_weakness',
    emoji: '📚',
    issue: { ar: 'ضعف المهارات الأكاديمية', en: 'Weak academic skills' },
    action: {
      ar: 'مجموعات مذاكرة ودعم أكاديمي.',
      en: 'Study groups and academic support.',
    },
  },
  {
    tag: 'relationship_building',
    emoji: '🤝',
    issue: { ar: 'مشكلة في تكوين العلاقات', en: 'Trouble forming relationships' },
    action: {
      ar: 'أنشطة تعاونية مع زملاء مناسبين.',
      en: 'Cooperative activities with suitable peers.',
    },
  },
  {
    tag: 'talent_discovery',
    emoji: '🏆',
    issue: { ar: 'اكتشاف موهبة', en: 'Talent discovery' },
    action: {
      ar: 'إشراكه في مسابقة أو مشروع مرتبط بموهبته.',
      en: 'Enroll in a competition or project matching their talent.',
    },
  },
  {
    tag: 'weak_school_belonging',
    emoji: '💙',
    issue: { ar: 'ضعف الانتماء للمدرسة', en: 'Weak school belonging' },
    action: {
      ar: 'المشاركة في مبادرات وخدمة مجتمعية.',
      en: 'Participate in initiatives and community service.',
    },
  },
] as const;

export function localizeIntervention(
  intervention: Intervention,
  locale: 'en' | 'ar'
) {
  return {
    tag: intervention.tag,
    emoji: intervention.emoji,
    issue: intervention.issue[locale],
    action: intervention.action[locale],
  };
}
