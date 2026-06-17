/**
 * 试映风险评分规则配置
 * 
 * 支持用户自定义风险评分规则，包括颜色偏移、破损类型、
 * 短片段阈值和备注关键词的分值调整。
 * 
 * 规则随本地数据和备份文件一同保存。
 */

const riskRulesStorageKey = "zfl17-risk-rules";

const DEFAULT_RISK_RULES = {
  shift: {
    "正常": 0,
    "偏红": 2,
    "偏青": 2,
    "偏黄": 1,
    "褪色": 3
  },

  damage: {
    "完好": 0,
    "轻微划痕": 2,
    "齿孔破损": 3,
    "接片松动": 2,
    "需跳过": 4
  },

  duration: {
    thresholds: [
      { max: 5, score: 2, reason: "极短片段（≤5秒）" },
      { max: 10, score: 1, reason: "较短片段（6-10秒）" }
    ]
  },

  noteKeywords: [
    { pattern: "跳过|需跳过", score: 3, reason: "备注含跳过提示" },
    { pattern: "破损|断裂", score: 2, reason: "备注含破损描述" },
    { pattern: "留意|注意|小心", score: 1, reason: "备注含留意提醒" },
    { pattern: "重新|重做|修复", score: 2, reason: "备注含修复需求" },
    { pattern: "松动|脱落", score: 2, reason: "备注含松动描述" }
  ],

  levels: [
    { max: 0, label: "安全", css: "risk-safe" },
    { max: 3, label: "低风险", css: "risk-low" },
    { max: 6, label: "中风险", css: "risk-medium" },
    { max: Infinity, label: "高风险", css: "risk-high" }
  ]
};

let currentRiskRules = null;

function compileNoteKeywords(keywords) {
  return keywords.map(kw => ({
    ...kw,
    pattern: new RegExp(kw.pattern)
  }));
}

function serializeRules(rules) {
  return {
    shift: { ...rules.shift },
    damage: { ...rules.damage },
    duration: {
      thresholds: rules.duration.thresholds.map(t => ({ ...t }))
    },
    noteKeywords: rules.noteKeywords.map(kw => ({
      pattern: kw.pattern instanceof RegExp ? kw.pattern.source : kw.pattern,
      score: kw.score,
      reason: kw.reason
    })),
    levels: rules.levels.map(l => ({ ...l, max: l.max === Infinity ? "Infinity" : l.max }))
  };
}

function deserializeRules(data) {
  if (!data) return null;
  
  try {
    const rules = {
      shift: { ...data.shift },
      damage: { ...data.damage },
      duration: {
        thresholds: data.duration.thresholds.map(t => ({ ...t }))
      },
      noteKeywords: compileNoteKeywords(data.noteKeywords),
      levels: data.levels.map(l => ({
        ...l,
        max: l.max === "Infinity" ? Infinity : l.max
      }))
    };
    return rules;
  } catch (e) {
    console.warn("Failed to deserialize risk rules:", e);
    return null;
  }
}

function loadRiskRules() {
  try {
    const saved = localStorage.getItem(riskRulesStorageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      const rules = deserializeRules(parsed);
      if (rules) {
        currentRiskRules = rules;
        return true;
      }
    }
  } catch (e) {
    console.warn("Failed to load risk rules from localStorage:", e);
  }
  currentRiskRules = deserializeRules(serializeRules(DEFAULT_RISK_RULES));
  return false;
}

function persistRiskRules() {
  try {
    const serialized = serializeRules(currentRiskRules);
    localStorage.setItem(riskRulesStorageKey, JSON.stringify(serialized));
    return true;
  } catch (e) {
    console.warn("Failed to save risk rules to localStorage:", e);
    return false;
  }
}

function resetRiskRulesToDefault() {
  currentRiskRules = deserializeRules(serializeRules(DEFAULT_RISK_RULES));
  persistRiskRules();
  return getCurrentRiskRules();
}

function getCurrentRiskRules() {
  return serializeRules(currentRiskRules);
}

function getCurrentRiskRulesForCalculation() {
  if (!currentRiskRules) {
    loadRiskRules();
  }
  if (currentRiskRules && currentRiskRules.noteKeywords) {
    currentRiskRules.noteKeywords = currentRiskRules.noteKeywords.map(kw => {
      if (kw.pattern instanceof RegExp) {
        return kw;
      }
      try {
        return { ...kw, pattern: new RegExp(String(kw.pattern)) };
      } catch (e) {
        return { ...kw, pattern: new RegExp("") };
      }
    });
  }
  return currentRiskRules;
}

function validateRiskRules(rules) {
  const errors = [];

  if (!rules.shift || typeof rules.shift !== "object") {
    errors.push("颜色偏移规则格式不正确");
  } else {
    for (const [key, value] of Object.entries(rules.shift)) {
      if (typeof value !== "number" || value < 0) {
        errors.push(`颜色偏移「${key}」的分值必须是非负整数`);
      }
    }
  }

  if (!rules.damage || typeof rules.damage !== "object") {
    errors.push("破损类型规则格式不正确");
  } else {
    for (const [key, value] of Object.entries(rules.damage)) {
      if (typeof value !== "number" || value < 0) {
        errors.push(`破损类型「${key}」的分值必须是非负整数`);
      }
    }
  }

  if (!rules.duration || !Array.isArray(rules.duration.thresholds)) {
    errors.push("片段时长规则格式不正确");
  } else {
    rules.duration.thresholds.forEach((t, i) => {
      if (typeof t.max !== "number" || t.max <= 0) {
        errors.push(`时长阈值[${i}]的 max 必须是正数`);
      }
      if (typeof t.score !== "number" || t.score < 0) {
        errors.push(`时长阈值[${i}]的分值必须是非负整数`);
      }
      if (!t.reason || typeof t.reason !== "string") {
        errors.push(`时长阈值[${i}]缺少原因描述`);
      }
    });
  }

  if (!Array.isArray(rules.noteKeywords)) {
    errors.push("备注关键词规则格式不正确");
  } else {
    rules.noteKeywords.forEach((kw, i) => {
      if (!kw.pattern || typeof kw.pattern !== "string") {
        errors.push(`备注关键词[${i}]缺少正则表达式`);
      } else {
        try {
          new RegExp(kw.pattern);
        } catch (e) {
          errors.push(`备注关键词[${i}]的正则表达式无效：${e.message}`);
        }
      }
      if (typeof kw.score !== "number" || kw.score < 0) {
        errors.push(`备注关键词[${i}]的分值必须是非负整数`);
      }
      if (!kw.reason || typeof kw.reason !== "string") {
        errors.push(`备注关键词[${i}]缺少原因描述`);
      }
    });
  }

  if (!Array.isArray(rules.levels)) {
    errors.push("风险等级规则格式不正确");
  } else {
    rules.levels.forEach((l, i) => {
      const maxVal = l.max === "Infinity" ? Infinity : l.max;
      if (typeof maxVal !== "number" || maxVal < 0) {
        errors.push(`风险等级[${i}]的 max 必须是非负数`);
      }
      if (!l.label || typeof l.label !== "string") {
        errors.push(`风险等级[${i}]缺少标签`);
      }
      if (!l.css || typeof l.css !== "string") {
        errors.push(`风险等级[${i}]缺少样式类名`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

function updateRiskRules(newRules) {
  const validation = validateRiskRules(newRules);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  const rules = deserializeRules(newRules);
  if (!rules) {
    return { success: false, errors: ["规则格式转换失败"] };
  }

  currentRiskRules = rules;
  persistRiskRules();
  return { success: true, rules: getCurrentRiskRules() };
}

function getSerializedRulesForBackup() {
  return serializeRules(currentRiskRules);
}

function restoreRulesFromBackup(backupRules) {
  const rules = deserializeRules(backupRules);
  if (!rules) {
    return { success: false, errors: ["备份中的规则格式无效"] };
  }
  currentRiskRules = rules;
  persistRiskRules();
  return { success: true, rules: getCurrentRiskRules() };
}

function calculateSegmentRisk(segment) {
  const rules = getCurrentRiskRulesForCalculation();
  let score = 0;
  const reasons = [];

  const shiftScore = rules.shift[segment.shift] ?? 0;
  if (shiftScore > 0) {
    score += shiftScore;
    reasons.push(`颜色偏移「${segment.shift}」(+${shiftScore})`);
  }

  const damageScore = rules.damage[segment.damage] ?? 0;
  if (damageScore > 0) {
    score += damageScore;
    reasons.push(`破损「${segment.damage}」(+${damageScore})`);
  }

  const dur = Number(segment.duration) || 0;
  for (const threshold of rules.duration.thresholds) {
    if (dur <= threshold.max) {
      score += threshold.score;
      reasons.push(`${threshold.reason}(+${threshold.score})`);
      break;
    }
  }

  const noteText = segment.note || "";
  for (const kw of rules.noteKeywords) {
    let pattern = kw.pattern;
    if (!(pattern instanceof RegExp)) {
      try {
        pattern = new RegExp(String(pattern));
      } catch (e) {
        continue;
      }
    }
    if (pattern.test(noteText)) {
      score += kw.score;
      reasons.push(`${kw.reason}(+${kw.score})`);
    }
  }

  let level = rules.levels[rules.levels.length - 1];
  for (const l of rules.levels) {
    if (score <= l.max) {
      level = l;
      break;
    }
  }

  return { score, label: level.label, css: level.css, reasons };
}

loadRiskRules();

if (!currentRiskRules || !currentRiskRules.noteKeywords || currentRiskRules.noteKeywords.some(kw => !(kw.pattern instanceof RegExp))) {
  currentRiskRules = deserializeRules(serializeRules(DEFAULT_RISK_RULES));
}

window.DEFAULT_RISK_RULES = DEFAULT_RISK_RULES;
window.RISK_RULES = currentRiskRules;
window.calculateSegmentRisk = calculateSegmentRisk;
window.getCurrentRiskRules = getCurrentRiskRules;
window.getCurrentRiskRulesForCalculation = getCurrentRiskRulesForCalculation;
window.updateRiskRules = updateRiskRules;
window.resetRiskRulesToDefault = resetRiskRulesToDefault;
window.getSerializedRulesForBackup = getSerializedRulesForBackup;
window.restoreRulesFromBackup = restoreRulesFromBackup;
window.validateRiskRules = validateRiskRules;
