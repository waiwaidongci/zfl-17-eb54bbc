/**
 * 试映风险评分规则配置
 * 
 * 本文件集中维护所有风险评分相关的规则定义，
 * 后续调整评分标准只需修改此文件即可。
 * 
 * 风险等级划分：
 * - 安全：0 分
 * - 低风险：1-3 分
 * - 中风险：4-6 分
 * - 高风险：7 分及以上
 */

const RISK_RULES = {
  /**
   * 颜色偏移评分规则
   * 分值越高表示风险越大
   */
  shift: {
    "正常": 0,
    "偏红": 2,
    "偏青": 2,
    "偏黄": 1,
    "褪色": 3
  },

  /**
   * 破损类型评分规则
   * 分值越高表示风险越大
   */
  damage: {
    "完好": 0,
    "轻微划痕": 2,
    "齿孔破损": 3,
    "接片松动": 2,
    "需跳过": 4
  },

  /**
   * 片段时长评分规则
   * 按阈值匹配，越短的片段风险越高
   * thresholds 按 max 从小到大排列，匹配到第一个符合条件的即停止
   */
  duration: {
    thresholds: [
      { max: 5, score: 2, reason: "极短片段（≤5秒）" },
      { max: 10, score: 1, reason: "较短片段（6-10秒）" }
    ]
  },

  /**
   * 备注关键词评分规则
   * 匹配到关键词即累加相应分值
   * pattern 使用正则表达式，可灵活匹配
   */
  noteKeywords: [
    { pattern: /跳过|需跳过/, score: 3, reason: "备注含跳过提示" },
    { pattern: /破损|断裂/, score: 2, reason: "备注含破损描述" },
    { pattern: /留意|注意|小心/, score: 1, reason: "备注含留意提醒" },
    { pattern: /重新|重做|修复/, score: 2, reason: "备注含修复需求" },
    { pattern: /松动|脱落/, score: 2, reason: "备注含松动描述" }
  ],

  /**
   * 风险等级划分规则
   * 按 max 从小到大排列，匹配到第一个符合条件的即停止
   * css 字段对应样式类名，用于界面显示
   */
  levels: [
    { max: 0, label: "安全", css: "risk-safe" },
    { max: 3, label: "低风险", css: "risk-low" },
    { max: 6, label: "中风险", css: "risk-medium" },
    { max: Infinity, label: "高风险", css: "risk-high" }
  ]
};

/**
 * 计算单个片段的风险评分
 * @param {Object} segment - 片段对象
 * @param {string} segment.shift - 颜色偏移
 * @param {string} segment.damage - 破损情况
 * @param {number} segment.duration - 时长（秒）
 * @param {string} segment.note - 备注
 * @returns {Object} 风险评分结果
 * @returns {number} returns.score - 总分
 * @returns {string} returns.label - 风险等级标签
 * @returns {string} returns.css - 样式类名
 * @returns {string[]} returns.reasons - 风险原因列表
 */
function calculateSegmentRisk(segment) {
  let score = 0;
  const reasons = [];

  // 颜色偏移评分
  const shiftScore = RISK_RULES.shift[segment.shift] ?? 0;
  if (shiftScore > 0) {
    score += shiftScore;
    reasons.push(`颜色偏移「${segment.shift}」(+${shiftScore})`);
  }

  // 破损类型评分
  const damageScore = RISK_RULES.damage[segment.damage] ?? 0;
  if (damageScore > 0) {
    score += damageScore;
    reasons.push(`破损「${segment.damage}」(+${damageScore})`);
  }

  // 片段时长评分
  const dur = Number(segment.duration) || 0;
  for (const threshold of RISK_RULES.duration.thresholds) {
    if (dur <= threshold.max) {
      score += threshold.score;
      reasons.push(`${threshold.reason}(+${threshold.score})`);
      break;
    }
  }

  // 备注关键词评分
  const noteText = segment.note || "";
  for (const kw of RISK_RULES.noteKeywords) {
    if (kw.pattern.test(noteText)) {
      score += kw.score;
      reasons.push(`${kw.reason}(+${kw.score})`);
    }
  }

  // 确定风险等级
  let level = RISK_RULES.levels[RISK_RULES.levels.length - 1];
  for (const l of RISK_RULES.levels) {
    if (score <= l.max) {
      level = l;
      break;
    }
  }

  return { score, label: level.label, css: level.css, reasons };
}

window.RISK_RULES = RISK_RULES;
window.calculateSegmentRisk = calculateSegmentRisk;
