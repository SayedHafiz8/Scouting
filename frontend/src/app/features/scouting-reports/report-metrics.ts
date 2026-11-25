// ═══════════════════════════════════════════════════════════════════════════
//  بنود تقييم تقرير الكشاف — مصدر الحقيقة في الفرونت إند
// ═══════════════════════════════════════════════════════════════════════════
//
// طلب مالك 2026-11-18 — 10 مجموعات بدل 3 (كانت technical/physical/mental)،
// و2026-11-25 — 31 بند والسلّم 1→10.
// النسخة المقابلة على السيرفر في Backend/constants/reportMetrics.js
// — **لازم الاتنين يتغيّروا مع بعض**: المفاتيح هنا هي نفس مسارات الـAPI بالحرف.
//
// الفورم وصفحة التفاصيل وقايمة التقارير كلهم بيلفّوا على الليستة دي — مفيش
// كارد مكتوب بالإيد لكل مجموعة زي قبل كده، عشان بند جديد يبقى سطر واحد هنا.

// طلب مالك 2026-11-25 — السلّم رجع 1→10 (كان اتحوّل لـ1→5 في 2026-11-18)
export const RATING_MIN = 1;
export const RATING_MAX = 10;

/** خطوات الأزرار: 1..10 — مشتقّة من RATING_MAX مش مكتوبة بالإيد */
export const RATING_STEPS: readonly number[] = Array.from(
  { length: RATING_MAX - RATING_MIN + 1 },
  (_, i) => RATING_MIN + i
);

export interface ReportMetric {
  /** مفتاح الحقل جوه المجموعة — نفس اسمه في الـAPI */
  readonly key: string;
  /** مفتاح الترجمة */
  readonly label: string;
}

export interface ReportMetricGroup {
  /** مفتاح المجموعة — نفس اسمه في الـAPI */
  readonly key: string;
  readonly label: string;
  /** لون المجموعة في الواجهة (نفس لوحة الألوان القديمة، موزّعة على 10) */
  readonly color: string;
  /** اختصار إنجليزي قصير لمحور الرادار (الرادار مابيترجمش — SVG) */
  readonly short: string;
  /**
   * عنوان قسم بيظهر **فوق** المجموعة دي. مجموعة واحدة بس عندها قيمة:
   * "القدرات الخاصة والسمات السلوكية" فوق مجموعة الشخصية — زي ما الليستة
   * الأصلية مكتوبة بالظبط. ده عنوان عرض، مش مستوى بيانات.
   */
  readonly sectionLabel?: string;
  readonly metrics: readonly ReportMetric[];
}

export const REPORT_METRIC_GROUPS: readonly ReportMetricGroup[] = [
  {
    key: 'decisionMaking',
    label: 'REPORTS.GROUPS.DECISION_MAKING',
    color: '#22c55e',
    short: 'Dec',
    metrics: [
      { key: 'positioningAndPossession', label: 'REPORTS.METRICS.POSITIONING_AND_POSSESSION' },
      { key: 'interceptingWithoutTackling', label: 'REPORTS.METRICS.INTERCEPTING_WITHOUT_TACKLING' },
    ],
  },
  {
    key: 'selfMotivation',
    label: 'REPORTS.GROUPS.SELF_MOTIVATION',
    color: '#16a34a',
    short: 'Mot',
    metrics: [
      { key: 'consistency', label: 'REPORTS.METRICS.CONSISTENCY' },
      { key: 'winningBallBack', label: 'REPORTS.METRICS.WINNING_BALL_BACK' },
      { key: 'coachability', label: 'REPORTS.METRICS.COACHABILITY' },
    ],
  },
  {
    key: 'technicalSkills',
    label: 'REPORTS.GROUPS.TECHNICAL_SKILLS',
    color: '#0ea5e9',
    short: 'Tech',
    metrics: [
      { key: 'firstTouch', label: 'REPORTS.METRICS.FIRST_TOUCH' },
      { key: 'twoFooted', label: 'REPORTS.METRICS.TWO_FOOTED' },
      { key: 'shieldingUnderPressure', label: 'REPORTS.METRICS.SHIELDING_UNDER_PRESSURE' },
      { key: 'beatingOpponent', label: 'REPORTS.METRICS.BEATING_OPPONENT' },
      // اتضافوا 2026-11-25
      { key: 'longPassing', label: 'REPORTS.METRICS.LONG_PASSING' },
      { key: 'shortPassing', label: 'REPORTS.METRICS.SHORT_PASSING' },
      { key: 'heading', label: 'REPORTS.METRICS.HEADING' },
    ],
  },
  {
    key: 'physicalAbilities',
    label: 'REPORTS.GROUPS.PHYSICAL_ABILITIES',
    color: '#38bdf8',
    short: 'Phys',
    metrics: [
      { key: 'pace', label: 'REPORTS.METRICS.PACE' },
      { key: 'agility', label: 'REPORTS.METRICS.AGILITY' },
      { key: 'dynamism', label: 'REPORTS.METRICS.DYNAMISM' },
      { key: 'bodyUseInDuels', label: 'REPORTS.METRICS.BODY_USE_IN_DUELS' },
    ],
  },
  {
    key: 'personality',
    label: 'REPORTS.GROUPS.PERSONALITY',
    color: '#8b5cf6',
    short: 'Pers',
    sectionLabel: 'REPORTS.GROUPS.SPECIAL_SECTION',
    metrics: [
      { key: 'leadership', label: 'REPORTS.METRICS.LEADERSHIP' },
      { key: 'motivatingTeammates', label: 'REPORTS.METRICS.MOTIVATING_TEAMMATES' },
      { key: 'teamwork', label: 'REPORTS.METRICS.TEAMWORK' },
    ],
  },
  {
    key: 'specialDefending',
    label: 'REPORTS.GROUPS.SPECIAL_DEFENDING',
    color: '#6366f1',
    short: 'Def',
    metrics: [
      { key: 'blockingShots', label: 'REPORTS.METRICS.BLOCKING_SHOTS' },
      { key: 'strongInDuels', label: 'REPORTS.METRICS.STRONG_IN_DUELS' },
      { key: 'preventingPenetration', label: 'REPORTS.METRICS.PREVENTING_PENETRATION' },
    ],
  },
  {
    key: 'specialAttacking',
    label: 'REPORTS.GROUPS.SPECIAL_ATTACKING',
    color: '#f43f5e',
    short: 'Att',
    metrics: [
      { key: 'buildUpPlay', label: 'REPORTS.METRICS.BUILD_UP_PLAY' },
      { key: 'creatingGoals', label: 'REPORTS.METRICS.CREATING_GOALS' },
      { key: 'scoringGoals', label: 'REPORTS.METRICS.SCORING_GOALS' },
    ],
  },
  {
    key: 'workEthic',
    label: 'REPORTS.GROUPS.WORK_ETHIC',
    color: '#f59e0b',
    short: 'Work',
    metrics: [
      { key: 'maximumEffort', label: 'REPORTS.METRICS.MAXIMUM_EFFORT' },
      { key: 'continuousImprovement', label: 'REPORTS.METRICS.CONTINUOUS_IMPROVEMENT' },
      { key: 'purposeAndDedication', label: 'REPORTS.METRICS.PURPOSE_AND_DEDICATION' },
    ],
  },
  {
    key: 'onFieldLeadership',
    label: 'REPORTS.GROUPS.ON_FIELD_LEADERSHIP',
    color: '#d946ef',
    short: 'Lead',
    metrics: [
      { key: 'inspiringLeader', label: 'REPORTS.METRICS.INSPIRING_LEADER' },
      { key: 'teamSpirit', label: 'REPORTS.METRICS.TEAM_SPIRIT' },
    ],
  },
  {
    key: 'winningMentality',
    label: 'REPORTS.GROUPS.WINNING_MENTALITY',
    color: '#eab308',
    short: 'Win',
    metrics: [
      { key: 'fullCommitment', label: 'REPORTS.METRICS.FULL_COMMITMENT' },
    ],
  },
];

/** كل البنود مسطّحة — نفس شكل مخرج /statistics (مسطّح بمستوى واحد) */
export const REPORT_METRICS_FLAT: readonly { group: ReportMetricGroup; metric: ReportMetric }[] =
  REPORT_METRIC_GROUPS.flatMap(group => group.metrics.map(metric => ({ group, metric })));

export const REPORT_METRIC_COUNT = REPORT_METRICS_FLAT.length;

/**
 * لون القيمة على السلّم الحالي. النسبة هي المعيار (0.8 / 0.5) مش رقم ثابت،
 * فنفس الدالة تفضل صح لو السلّم اتغيّر تاني — وده حصل مرتين في أسبوع.
 */
export const ratingColorOf = (value: number | null | undefined, max = RATING_MAX): string => {
  if (!value) return 'var(--text-muted)';
  const ratio = value / max;
  return ratio >= 0.8 ? '#22c55e' : ratio >= 0.5 ? '#f59e0b' : '#f43f5e';
};
