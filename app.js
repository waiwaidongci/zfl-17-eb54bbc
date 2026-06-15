const storageKey = "zfl17-film-strip-desk";

const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

function createDefaultReel(title = "春日试映A卷") {
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: Date.now(),
    segments: [
      {
        id: crypto.randomUUID(),
        code: "A-001",
        duration: 18,
        shift: "正常",
        damage: "完好",
        note: "开场街景，节奏平稳，适合保留原顺序。",
        thumb: ""
      },
      {
        id: crypto.randomUUID(),
        code: "A-006",
        duration: 9,
        shift: "偏红",
        damage: "轻微划痕",
        note: "人物近景左侧有划痕，试映时留意是否明显。",
        thumb: ""
      },
      {
        id: crypto.randomUUID(),
        code: "A-012",
        duration: 14,
        shift: "褪色",
        damage: "接片松动",
        note: "接片位置靠近段尾，放映前建议重新压平。",
        thumb: ""
      }
    ],
    checklist: []
  };
}

const defaultTemplates = [
  {
    id: crypto.randomUUID(),
    name: "常规完好片",
    duration: 12,
    shift: "正常",
    damage: "完好",
    notePrefix: ""
  },
  {
    id: crypto.randomUUID(),
    name: "轻微划痕旧片",
    duration: 10,
    shift: "偏红",
    damage: "轻微划痕",
    notePrefix: "【旧片】"
  }
];

function createDefaultWorkspace() {
  const firstReel = createDefaultReel("春日试映A卷");
  return {
    version: 2,
    activeReelId: firstReel.id,
    reels: [firstReel],
    templates: structuredClone(defaultTemplates)
  };
}

function migrateLegacyState(saved) {
  if (!saved) return null;
  if (saved.version === 2 && Array.isArray(saved.reels)) return null;

  const migrated = createDefaultWorkspace();
  const legacyReel = migrated.reels[0];

  if (typeof saved.reelTitle === "string") {
    legacyReel.title = saved.reelTitle || "未命名胶片卷";
  }
  if (Array.isArray(saved.segments)) {
    legacyReel.segments = saved.segments.map((seg) => ({
      ...seg,
      id: seg.id || crypto.randomUUID()
    }));
  }
  if (Array.isArray(saved.checklist)) {
    legacyReel.checklist = saved.checklist.map((item) => ({
      ...item,
      id: item.id || crypto.randomUUID()
    }));
  }
  if (Array.isArray(saved.templates)) {
    migrated.templates = saved.templates.map((tpl) => ({
      ...tpl,
      id: tpl.id || crypto.randomUUID()
    }));
  }
  migrated.activeReelId = legacyReel.id;

  return migrated;
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return createDefaultWorkspace();

  let parsed;
  try {
    parsed = JSON.parse(saved);
  } catch {
    return createDefaultWorkspace();
  }

  const migrated = migrateLegacyState(parsed);
  if (migrated) return migrated;

  if (!Array.isArray(parsed.reels) || parsed.reels.length === 0) {
    return createDefaultWorkspace();
  }

  const validIds = parsed.reels.map((r) => r.id);
  if (!validIds.includes(parsed.activeReelId)) {
    parsed.activeReelId = validIds[0];
  }

  const defaults = createDefaultWorkspace();
  return {
    ...defaults,
    ...parsed,
    templates: Array.isArray(parsed.templates) && parsed.templates.length > 0
      ? parsed.templates
      : defaults.templates
  };
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getActiveReel() {
  let reel = state.reels.find((r) => r.id === state.activeReelId);
  if (!reel && state.reels.length > 0) {
    reel = state.reels[0];
    state.activeReelId = reel.id;
  }
  return reel;
}

let state = loadState();
let draggedId = null;
let activeDrawerSegmentId = null;
let drawerThumbDataUrl = "";

const els = {
  reelSwitcherBtn: document.querySelector("#reelSwitcherBtn"),
  activeReelName: document.querySelector("#activeReelName"),
  reelCountBadge: document.querySelector("#reelCountBadge"),
  reelModalBackdrop: document.querySelector("#reelModalBackdrop"),
  reelModal: document.querySelector("#reelModal"),
  reelModalClose: document.querySelector("#reelModalClose"),
  createReelBtn: document.querySelector("#createReelBtn"),
  newReelNameInput: document.querySelector("#newReelNameInput"),
  reelList: document.querySelector("#reelList"),
  reelListTip: document.querySelector("#reelListTip"),

  reelTitle: document.querySelector("#reelTitle"),
  colorFilter: document.querySelector("#colorFilter"),
  searchInput: document.querySelector("#searchInput"),
  segmentForm: document.querySelector("#segmentForm"),
  codeInput: document.querySelector("#codeInput"),
  durationInput: document.querySelector("#durationInput"),
  shiftInput: document.querySelector("#shiftInput"),
  damageInput: document.querySelector("#damageInput"),
  thumbInput: document.querySelector("#thumbInput"),
  noteInput: document.querySelector("#noteInput"),
  segmentList: document.querySelector("#segmentList"),
  warningList: document.querySelector("#warningList"),
  totalDuration: document.querySelector("#totalDuration"),
  damageCount: document.querySelector("#damageCount"),
  segmentCount: document.querySelector("#segmentCount"),
  exportBtn: document.querySelector("#exportBtn"),
  templateSelect: document.querySelector("#templateSelect"),
  applyTemplateBtn: document.querySelector("#applyTemplateBtn"),
  templateForm: document.querySelector("#templateForm"),
  templateNameInput: document.querySelector("#templateNameInput"),
  templateDurationInput: document.querySelector("#templateDurationInput"),
  templateShiftInput: document.querySelector("#templateShiftInput"),
  templateDamageInput: document.querySelector("#templateDamageInput"),
  templateNoteInput: document.querySelector("#templateNoteInput"),
  templateList: document.querySelector("#templateList"),
  templateCount: document.querySelector("#templateCount"),
  checklistForm: document.querySelector("#checklistForm"),
  checklistInput: document.querySelector("#checklistInput"),
  autoChecklist: document.querySelector("#autoChecklist"),
  manualChecklist: document.querySelector("#manualChecklist"),
  checklistStats: document.querySelector("#checklistStats"),
  segmentDrawer: document.querySelector("#segmentDrawer"),
  drawerBackdrop: document.querySelector("#drawerBackdrop"),
  drawerClose: document.querySelector("#drawerClose"),
  drawerThumb: document.querySelector("#drawerThumb"),
  drawerThumbInput: document.querySelector("#drawerThumbInput"),
  drawerForm: document.querySelector("#drawerForm"),
  drawerCode: document.querySelector("#drawerCode"),
  drawerDuration: document.querySelector("#drawerDuration"),
  drawerShift: document.querySelector("#drawerShift"),
  drawerDamage: document.querySelector("#drawerDamage"),
  drawerNote: document.querySelector("#drawerNote"),
  drawerDelete: document.querySelector("#drawerDelete"),
  importBtn: document.querySelector("#importBtn"),
  importModalBackdrop: document.querySelector("#importModalBackdrop"),
  importModal: document.querySelector("#importModal"),
  importModalClose: document.querySelector("#importModalClose"),
  importCsvText: document.querySelector("#importCsvText"),
  importCsvFile: document.querySelector("#importCsvFile"),
  importParseBtn: document.querySelector("#importParseBtn"),
  importErrors: document.querySelector("#importErrors"),
  importPreviewWrap: document.querySelector("#importPreviewWrap"),
  importPreviewStats: document.querySelector("#importPreviewStats"),
  importPreviewBody: document.querySelector("#importPreviewBody"),
  importConfirmBtn: document.querySelector("#importConfirmBtn"),
  importCancelBtn: document.querySelector("#importCancelBtn")
};

function getFilteredSegments() {
  const reel = getActiveReel();
  if (!reel) return [];
  const color = els.colorFilter.value;
  const keyword = els.searchInput.value.trim();
  return reel.segments.filter((item) => {
    const matchesColor = color === "all" || item.shift === color;
    const matchesKeyword = !keyword || `${item.code}${item.note}${item.damage}`.includes(keyword);
    return matchesColor && matchesKeyword;
  });
}

function renderStats() {
  const reel = getActiveReel();
  if (!reel) {
    els.totalDuration.textContent = "0:00";
    els.damageCount.textContent = "0";
    els.segmentCount.textContent = "0";
    return;
  }
  const total = reel.segments.reduce((sum, item) => sum + Number(item.duration), 0);
  const damaged = reel.segments.filter((item) => item.damage !== "完好").length;
  els.totalDuration.textContent = formatDuration(total);
  els.damageCount.textContent = damaged;
  els.segmentCount.textContent = reel.segments.length;
}

function renderReelHeader() {
  const reel = getActiveReel();
  els.activeReelName.textContent = reel ? reel.title : "—";
  els.reelCountBadge.textContent = `${state.reels.length} 卷`;
  if (reel) {
    els.reelTitle.value = reel.title;
  }
}

function renderList() {
  const reel = getActiveReel();
  if (!reel) {
    els.segmentList.innerHTML = `<p class="empty">没有胶片卷。</p>`;
    return;
  }
  const segments = getFilteredSegments();
  els.segmentList.innerHTML =
    segments
      .map((item) => {
        const realIndex = reel.segments.findIndex((segment) => segment.id === item.id);
        const hasDamage = item.damage !== "完好";
        return `
          <article class="segment-card" draggable="true" data-id="${item.id}" data-view="${item.id}" title="点击查看详情">
            <div class="thumb">
              ${
                item.thumb
                  ? `<img src="${item.thumb}" alt="${escapeHtml(item.code)}缩略图" />`
                  : `<div class="film-placeholder" style="background:${fallbackThumbs[realIndex % fallbackThumbs.length]}">${escapeHtml(item.code)}</div>`
              }
            </div>
            <div class="segment-main">
              <div class="segment-title">
                <strong>${realIndex + 1}. ${escapeHtml(item.code)}</strong>
                <span>${formatDuration(item.duration)}</span>
              </div>
              <div class="tag-row">
                <span class="tag">${escapeHtml(item.shift)}</span>
                <span class="tag ${hasDamage ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>
              </div>
              <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
            </div>
            <div class="segment-actions">
              <button type="button" title="上移" data-move-up="${item.id}">↑</button>
              <button type="button" title="下移" data-move-down="${item.id}">↓</button>
              <button type="button" title="删除" data-delete="${item.id}">×</button>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">没有符合筛选的片段。</p>`;
}

function renderWarnings() {
  const reel = getActiveReel();
  if (!reel) {
    els.warningList.innerHTML = `<p class="empty">当前没有胶片卷。</p>`;
    return;
  }
  const warnings = reel.segments.filter((item) => item.damage !== "完好" || item.shift !== "正常");
  els.warningList.innerHTML =
    warnings
      .map((item) => {
        const index = reel.segments.findIndex((segment) => segment.id === item.id) + 1;
        const reasons = [item.shift !== "正常" ? item.shift : "", item.damage !== "完好" ? item.damage : ""].filter(Boolean).join(" · ");
        return `
          <div class="warning-item">
            <strong>${index}. ${escapeHtml(item.code)}</strong>
            <span>${escapeHtml(reasons)}${item.note ? `：${escapeHtml(item.note)}` : ""}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">当前清单没有颜色偏移或破损提醒。</p>`;
}

function renderTemplateSelect() {
  els.templateSelect.innerHTML =
    `<option value="">— 选择模板 —</option>` +
    state.templates
      .map((tpl) => `<option value="${tpl.id}">${escapeHtml(tpl.name)}</option>`)
      .join("");
}

function renderTemplateList() {
  els.templateCount.textContent = `${state.templates.length} 个`;
  els.templateList.innerHTML =
    state.templates
      .map((tpl) => {
        const hasDamage = tpl.damage !== "完好";
        return `
          <div class="template-card" data-id="${tpl.id}">
            <div class="template-card-head">
              <strong>${escapeHtml(tpl.name)}</strong>
              <button type="button" class="template-delete" title="删除模板" data-delete-template="${tpl.id}">×</button>
            </div>
            <div class="tag-row">
              <span class="tag">${formatDuration(tpl.duration)}</span>
              <span class="tag">${escapeHtml(tpl.shift)}</span>
              <span class="tag ${hasDamage ? "damage" : "ok"}">${escapeHtml(tpl.damage)}</span>
            </div>
            ${tpl.notePrefix ? `<p class="template-note">前缀：${escapeHtml(tpl.notePrefix)}</p>` : ""}
            <button type="button" class="template-apply" data-apply-template="${tpl.id}">一键套用</button>
          </div>
        `;
      })
      .join("") || `<p class="empty">还没有模板，先在上方创建一个吧。</p>`;
}

function renderTemplates() {
  renderTemplateSelect();
  renderTemplateList();
}

function applyTemplate(templateId) {
  const tpl = state.templates.find((t) => t.id === templateId);
  if (!tpl) return;
  els.durationInput.value = tpl.duration;
  els.shiftInput.value = tpl.shift;
  els.damageInput.value = tpl.damage;
  if (tpl.notePrefix && !els.noteInput.value.startsWith(tpl.notePrefix)) {
    els.noteInput.value = tpl.notePrefix + els.noteInput.value;
  } else if (tpl.notePrefix && !els.noteInput.value) {
    els.noteInput.value = tpl.notePrefix;
  }
}

function addTemplate(event) {
  event.preventDefault();
  const name = els.templateNameInput.value.trim();
  if (!name) return;
  state.templates.push({
    id: crypto.randomUUID(),
    name,
    duration: Number(els.templateDurationInput.value),
    shift: els.templateShiftInput.value,
    damage: els.templateDamageInput.value,
    notePrefix: els.templateNoteInput.value.trim()
  });
  els.templateForm.reset();
  els.templateDurationInput.value = 12;
  renderAll();
}

function deleteTemplate(id) {
  state.templates = state.templates.filter((t) => t.id !== id);
  renderAll();
}

function syncAutoChecklist() {
  const reel = getActiveReel();
  if (!reel) return;
  const problemSegments = reel.segments.filter(
    (seg) => seg.damage !== "完好" || seg.shift !== "正常"
  );
  const existingAutoMap = {};
  reel.checklist
    .filter((item) => item.source === "auto")
    .forEach((item) => {
      existingAutoMap[item.segmentId] = item;
    });
  const syncedAutoItems = [];
  problemSegments.forEach((seg) => {
    const existing = existingAutoMap[seg.id];
    const reasons = [seg.shift !== "正常" ? seg.shift : "", seg.damage !== "完好" ? seg.damage : ""].filter(Boolean).join("、");
    if (existing) {
      existing.text = `${seg.code}（${reasons}）`;
      syncedAutoItems.push(existing);
    } else {
      syncedAutoItems.push({
        id: crypto.randomUUID(),
        text: `${seg.code}（${reasons}）`,
        source: "auto",
        segmentId: seg.id,
        completed: false
      });
    }
  });
  const manualItems = reel.checklist.filter((item) => item.source === "manual");
  reel.checklist = [...syncedAutoItems, ...manualItems];
}

function addChecklistItem(event) {
  event.preventDefault();
  const reel = getActiveReel();
  if (!reel) return;
  const text = els.checklistInput.value.trim();
  if (!text) return;
  reel.checklist.push({
    id: crypto.randomUUID(),
    text,
    source: "manual",
    segmentId: null,
    completed: false
  });
  els.checklistForm.reset();
  renderAll();
}

function toggleChecklistItem(id) {
  const reel = getActiveReel();
  if (!reel) return;
  const item = reel.checklist.find((c) => c.id === id);
  if (item) item.completed = !item.completed;
  renderAll();
}

function deleteChecklistItem(id) {
  const reel = getActiveReel();
  if (!reel) return;
  reel.checklist = reel.checklist.filter((c) => c.id !== id);
  renderAll();
}

function renderChecklist() {
  const reel = getActiveReel();
  if (!reel) {
    els.checklistStats.textContent = "0 / 0 项已完成";
    els.autoChecklist.innerHTML = `<p class="empty">无胶片卷。</p>`;
    els.manualChecklist.innerHTML = `<p class="empty">无胶片卷。</p>`;
    return;
  }
  const autoItems = reel.checklist.filter((item) => item.source === "auto");
  const manualItems = reel.checklist.filter((item) => item.source === "manual");
  const completed = reel.checklist.filter((item) => item.completed).length;
  const total = reel.checklist.length;
  els.checklistStats.textContent = `${completed} / ${total} 项已完成`;

  els.autoChecklist.innerHTML =
    autoItems
      .map((item) => {
        const checkedClass = item.completed ? "checked" : "";
        return `
          <div class="checklist-item auto-item ${checkedClass}" data-check-id="${item.id}">
            <label class="checklist-checkbox">
              <input type="checkbox" ${item.completed ? "checked" : ""} data-toggle-check="${item.id}" />
              <span class="checkmark"></span>
            </label>
            <span class="checklist-text">${escapeHtml(item.text)}</span>
            <span class="checklist-badge auto-badge">自动</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">当前无破损或颜色偏移片段，无需自动待办。</p>`;

  els.manualChecklist.innerHTML =
    manualItems
      .map((item) => {
        const checkedClass = item.completed ? "checked" : "";
        return `
          <div class="checklist-item manual-item ${checkedClass}" data-check-id="${item.id}">
            <label class="checklist-checkbox">
              <input type="checkbox" ${item.completed ? "checked" : ""} data-toggle-check="${item.id}" />
              <span class="checkmark"></span>
            </label>
            <span class="checklist-text">${escapeHtml(item.text)}</span>
            <button type="button" class="checklist-delete" title="删除检查项" data-delete-check="${item.id}">×</button>
          </div>
        `;
      })
      .join("") || `<p class="empty">暂无临时检查项，可在上方输入添加。</p>`;
}

function renderReelList() {
  els.reelListTip.textContent = `共 ${state.reels.length} 卷`;
  els.reelList.innerHTML =
    state.reels
      .map((reel) => {
        const isActive = reel.id === state.activeReelId;
        const segCount = reel.segments.length;
        const totalDuration = reel.segments.reduce((sum, s) => sum + Number(s.duration), 0);
        const date = new Date(reel.createdAt);
        const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
        return `
          <div class="reel-card ${isActive ? "active" : ""}" data-reel-id="${reel.id}">
            <div class="reel-card-indicator" title="${isActive ? "当前工作卷" : "点击切换"}"></div>
            <div class="reel-card-main">
              <div class="reel-card-title-row">
                <span class="reel-card-title" data-reel-title="${reel.id}">${escapeHtml(reel.title)}</span>
                ${isActive ? `<span class="reel-badge active-badge">当前工作卷</span>` : ""}
              </div>
              <div class="reel-card-meta">
                <span>📽️ ${segCount} 个片段</span>
                <span>⏱️ ${formatDuration(totalDuration)}</span>
                <span>📅 ${dateStr}</span>
              </div>
            </div>
            <div class="reel-card-actions">
              <button type="button" class="reel-action-btn switch-btn" title="${isActive ? "正在使用" : "切换到此卷"}" data-switch-reel="${reel.id}" ${isActive ? "disabled" : ""}>
                ${isActive ? "✓" : "↻"}
              </button>
              <button type="button" class="reel-action-btn" title="重命名" data-rename-reel="${reel.id}">✎</button>
              <button type="button" class="reel-action-btn" title="复制此卷" data-duplicate-reel="${reel.id}">⎘</button>
              <button type="button" class="reel-action-btn delete-btn" title="删除此卷" data-delete-reel="${reel.id}">🗑</button>
            </div>
          </div>
        `;
      })
      .join("") || `<div class="reel-card-empty">还没有胶片卷，请在上方新建。</div>`;
}

function renderAll() {
  renderReelHeader();
  renderStats();
  renderList();
  renderWarnings();
  renderTemplates();
  syncAutoChecklist();
  renderChecklist();
  renderReelList();
  saveState();
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function addSegment(event) {
  event.preventDefault();
  const reel = getActiveReel();
  if (!reel) return;
  const thumb = await readFileAsDataUrl(els.thumbInput.files[0]);
  reel.segments.push({
    id: crypto.randomUUID(),
    code: els.codeInput.value.trim(),
    duration: Number(els.durationInput.value),
    shift: els.shiftInput.value,
    damage: els.damageInput.value,
    note: els.noteInput.value.trim(),
    thumb
  });
  els.segmentForm.reset();
  els.durationInput.value = 12;
  renderAll();
}

function moveSegment(id, direction) {
  const reel = getActiveReel();
  if (!reel) return;
  const index = reel.segments.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= reel.segments.length) return;
  const [item] = reel.segments.splice(index, 1);
  reel.segments.splice(target, 0, item);
  renderAll();
}

function exportList() {
  const reel = getActiveReel();
  if (!reel) return;
  const lines = [
    `胶片卷：${reel.title || "未命名胶片卷"}`,
    `总时长：${formatDuration(reel.segments.reduce((sum, item) => sum + Number(item.duration), 0))}`,
    "",
    ...reel.segments.map((item, index) => `${index + 1}. ${item.code}｜${formatDuration(item.duration)}｜${item.shift}｜${item.damage}｜${item.note || "无备注"}`)
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${reel.title || "film-reel"}-checklist.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openDrawer(segmentId) {
  const reel = getActiveReel();
  if (!reel) return;
  const segment = reel.segments.find((s) => s.id === segmentId);
  if (!segment) return;

  activeDrawerSegmentId = segmentId;
  drawerThumbDataUrl = segment.thumb || "";
  populateDrawer(segment);

  els.segmentDrawer.classList.add("open");
  els.drawerBackdrop.classList.add("open");
  els.segmentDrawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  activeDrawerSegmentId = null;
  drawerThumbDataUrl = "";
  els.segmentDrawer.classList.remove("open");
  els.drawerBackdrop.classList.remove("open");
  els.segmentDrawer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  els.drawerForm.reset();
}

function populateDrawer(segment) {
  const reel = getActiveReel();
  if (!reel) return;
  const realIndex = reel.segments.findIndex((s) => s.id === segment.id);

  if (segment.thumb) {
    els.drawerThumb.innerHTML = `<img src="${segment.thumb}" alt="${escapeHtml(segment.code)}缩略图" />`;
  } else {
    els.drawerThumb.innerHTML = `<div class="film-placeholder" style="background:${fallbackThumbs[realIndex % fallbackThumbs.length]}">${escapeHtml(segment.code)}</div>`;
  }

  els.drawerCode.value = segment.code;
  els.drawerDuration.value = segment.duration;
  els.drawerShift.value = segment.shift;
  els.drawerDamage.value = segment.damage;
  els.drawerNote.value = segment.note || "";
  drawerThumbDataUrl = segment.thumb || "";
}

async function saveDrawerEdits(event) {
  event.preventDefault();
  const reel = getActiveReel();
  if (!reel || !activeDrawerSegmentId) return;

  const segmentIndex = reel.segments.findIndex((s) => s.id === activeDrawerSegmentId);
  if (segmentIndex < 0) return;

  const file = els.drawerThumbInput.files[0];
  if (file) {
    drawerThumbDataUrl = await readFileAsDataUrl(file);
  }

  reel.segments[segmentIndex] = {
    ...reel.segments[segmentIndex],
    code: els.drawerCode.value.trim(),
    duration: Number(els.drawerDuration.value),
    shift: els.drawerShift.value,
    damage: els.drawerDamage.value,
    note: els.drawerNote.value.trim(),
    thumb: drawerThumbDataUrl
  };

  renderAll();
  closeDrawer();
}

function deleteFromDrawer() {
  const reel = getActiveReel();
  if (!reel || !activeDrawerSegmentId) return;
  if (!confirm("确定要删除此片段吗？此操作不可撤销。")) return;

  reel.segments = reel.segments.filter((s) => s.id !== activeDrawerSegmentId);
  renderAll();
  closeDrawer();
}

function openReelModal() {
  els.reelModal.classList.add("open");
  els.reelModalBackdrop.classList.add("open");
  els.reelModal.setAttribute("aria-hidden", "false");
  els.newReelNameInput.value = "";
}

function closeReelModal() {
  els.reelModal.classList.remove("open");
  els.reelModalBackdrop.classList.remove("open");
  els.reelModal.setAttribute("aria-hidden", "true");
  els.newReelNameInput.value = "";
}

function createReel() {
  const name = els.newReelNameInput.value.trim();
  if (!name) {
    els.newReelNameInput.focus();
    return;
  }
  const newReel = {
    id: crypto.randomUUID(),
    title: name,
    createdAt: Date.now(),
    segments: [],
    checklist: []
  };
  state.reels.push(newReel);
  state.activeReelId = newReel.id;
  els.newReelNameInput.value = "";
  renderAll();
}

function switchReel(reelId) {
  if (!state.reels.find((r) => r.id === reelId)) return;
  state.activeReelId = reelId;
  renderAll();
}

function renameReel(reelId) {
  const reel = state.reels.find((r) => r.id === reelId);
  if (!reel) return;
  const newName = prompt("请输入新的胶片卷名称：", reel.title);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) {
    alert("名称不能为空。");
    return;
  }
  reel.title = trimmed;
  renderAll();
}

function duplicateReel(reelId) {
  const reel = state.reels.find((r) => r.id === reelId);
  if (!reel) return;
  const copy = structuredClone(reel);
  copy.id = crypto.randomUUID();
  copy.title = `${reel.title} 副本`;
  copy.createdAt = Date.now();
  copy.segments = copy.segments.map((seg) => ({ ...seg, id: crypto.randomUUID() }));
  copy.checklist = copy.checklist.map((item) => ({ ...item, id: crypto.randomUUID() }));
  state.reels.push(copy);
  state.activeReelId = copy.id;
  renderAll();
}

function deleteReel(reelId) {
  const reel = state.reels.find((r) => r.id === reelId);
  if (!reel) return;
  if (state.reels.length <= 1) {
    alert("至少需要保留一个胶片卷。");
    return;
  }
  if (!confirm(`确定要删除胶片卷「${reel.title}」吗？此操作不可撤销。`)) return;

  state.reels = state.reels.filter((r) => r.id !== reelId);
  if (state.activeReelId === reelId) {
    state.activeReelId = state.reels[0].id;
  }
  renderAll();
}

els.reelSwitcherBtn.addEventListener("click", openReelModal);
els.reelModalClose.addEventListener("click", closeReelModal);
els.reelModalBackdrop.addEventListener("click", closeReelModal);

els.createReelBtn.addEventListener("click", createReel);
els.newReelNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    createReel();
  }
});

els.reelList.addEventListener("click", (event) => {
  const switchBtn = event.target.closest("[data-switch-reel]");
  const renameBtn = event.target.closest("[data-rename-reel]");
  const duplicateBtn = event.target.closest("[data-duplicate-reel]");
  const deleteBtn = event.target.closest("[data-delete-reel]");
  const card = event.target.closest(".reel-card");

  if (switchBtn) {
    event.stopPropagation();
    switchReel(switchBtn.dataset.switchReel);
  } else if (renameBtn) {
    event.stopPropagation();
    renameReel(renameBtn.dataset.renameReel);
  } else if (duplicateBtn) {
    event.stopPropagation();
    duplicateReel(duplicateBtn.dataset.duplicateReel);
  } else if (deleteBtn) {
    event.stopPropagation();
    deleteReel(deleteBtn.dataset.deleteReel);
  } else if (card && card.dataset.reelId) {
    event.stopPropagation();
    if (card.dataset.reelId !== state.activeReelId) {
      switchReel(card.dataset.reelId);
    }
  }
});

els.reelTitle.addEventListener("input", () => {
  const reel = getActiveReel();
  if (reel) {
    reel.title = els.reelTitle.value;
    renderReelHeader();
    renderReelList();
    saveState();
  }
});

els.colorFilter.addEventListener("change", renderList);
els.searchInput.addEventListener("input", renderList);
els.segmentForm.addEventListener("submit", addSegment);
els.exportBtn.addEventListener("click", exportList);

els.segmentList.addEventListener("click", (event) => {
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-delete]");
  const view = event.target.closest("[data-view]");

  if (up) {
    event.stopPropagation();
    moveSegment(up.dataset.moveUp, -1);
  }
  if (down) {
    event.stopPropagation();
    moveSegment(down.dataset.moveDown, 1);
  }
  if (remove) {
    event.stopPropagation();
    const reel = getActiveReel();
    if (reel) {
      reel.segments = reel.segments.filter((item) => item.id !== remove.dataset.delete);
      renderAll();
    }
  }
  if (view && !up && !down && !remove) {
    openDrawer(view.dataset.view);
  }
});

els.segmentList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

els.segmentList.addEventListener("dragend", (event) => {
  event.target.closest("[data-id]")?.classList.remove("dragging");
  draggedId = null;
});

els.segmentList.addEventListener("dragover", (event) => {
  const reel = getActiveReel();
  if (!reel) return;
  const card = event.target.closest("[data-id]");
  if (!card || !draggedId || card.dataset.id === draggedId) return;
  event.preventDefault();
  const fromIndex = reel.segments.findIndex((item) => item.id === draggedId);
  const toIndex = reel.segments.findIndex((item) => item.id === card.dataset.id);
  if (fromIndex < 0 || toIndex < 0) return;
  const [item] = reel.segments.splice(fromIndex, 1);
  reel.segments.splice(toIndex, 0, item);
  renderAll();
});

els.applyTemplateBtn.addEventListener("click", () => {
  const id = els.templateSelect.value;
  if (id) applyTemplate(id);
});

els.templateSelect.addEventListener("change", () => {
  const id = els.templateSelect.value;
  if (id) applyTemplate(id);
});

els.templateForm.addEventListener("submit", addTemplate);

els.templateList.addEventListener("click", (event) => {
  const applyBtn = event.target.closest("[data-apply-template]");
  const deleteBtn = event.target.closest("[data-delete-template]");
  if (applyBtn) applyTemplate(applyBtn.dataset.applyTemplate);
  if (deleteBtn) deleteTemplate(deleteBtn.dataset.deleteTemplate);
});

els.checklistForm.addEventListener("submit", addChecklistItem);

document.querySelector(".checklist-panel").addEventListener("click", (event) => {
  const remove = event.target.closest("[data-delete-check]");
  if (remove) deleteChecklistItem(remove.dataset.deleteCheck);
});

document.querySelector(".checklist-panel").addEventListener("change", (event) => {
  const toggle = event.target.closest("[data-toggle-check]");
  if (toggle) toggleChecklistItem(toggle.dataset.toggleCheck);
});

els.drawerClose.addEventListener("click", closeDrawer);
els.drawerBackdrop.addEventListener("click", closeDrawer);
els.drawerForm.addEventListener("submit", saveDrawerEdits);
els.drawerDelete.addEventListener("click", deleteFromDrawer);

els.drawerThumbInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (file) {
    drawerThumbDataUrl = await readFileAsDataUrl(file);
    if (drawerThumbDataUrl) {
      els.drawerThumb.innerHTML = `<img src="${drawerThumbDataUrl}" alt="缩略图预览" />`;
    }
  }
});

const validShifts = ["正常", "偏红", "偏青", "偏黄", "褪色"];
const validDamages = ["完好", "轻微划痕", "齿孔破损", "接片松动", "需跳过"];
let importParsedRows = [];

function openImportModal() {
  els.importModal.classList.add("open");
  els.importModalBackdrop.classList.add("open");
  els.importModal.setAttribute("aria-hidden", "false");
  els.importCsvText.value = "";
  els.importCsvFile.value = "";
  els.importErrors.style.display = "none";
  els.importPreviewWrap.style.display = "none";
  els.importConfirmBtn.disabled = true;
  importParsedRows = [];
}

function closeImportModal() {
  els.importModal.classList.remove("open");
  els.importModalBackdrop.classList.remove("open");
  els.importModal.setAttribute("aria-hidden", "true");
  importParsedRows = [];
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const fields = parseCsvLine(raw);
    if (fields.length === 1 && fields[0].toLowerCase() === "片段编号") continue;
    if (fields.length === 5 || fields.length === 4) {
      rows.push({ lineNum: i + 1, raw, fields });
    } else {
      rows.push({ lineNum: i + 1, raw, fields, parseError: "列数不符（需4或5列）" });
    }
  }
  return rows;
}

function validateImportRows(rows) {
  const reel = getActiveReel();
  const existingCodes = reel ? reel.segments.map((s) => s.code) : [];
  const codeCountMap = {};
  const validated = [];

  for (const row of rows) {
    const errors = [];
    const isParseError = !!row.parseError;

    if (isParseError) {
      validated.push({
        ...row,
        code: "",
        duration: "",
        shift: "",
        damage: "",
        note: "",
        status: "error",
        statusText: row.parseError
      });
      continue;
    }

    const [code, durationStr, shift, damage, note] = row.fields;
    const trimmedCode = (code || "").trim();
    const trimmedDuration = (durationStr || "").trim();
    const trimmedShift = (shift || "").trim();
    const trimmedDamage = (damage || "").trim();
    const trimmedNote = (note || "").trim();

    if (!trimmedCode) {
      errors.push("片段编号为空");
    }

    const durationNum = Number(trimmedDuration);
    if (!trimmedDuration || isNaN(durationNum) || durationNum <= 0 || !Number.isFinite(durationNum)) {
      errors.push("非法时长（需为正整数）");
    }

    if (trimmedShift && !validShifts.includes(trimmedShift)) {
      errors.push(`颜色偏移「${trimmedShift}」不在可选值中`);
    }

    if (trimmedDamage && !validDamages.includes(trimmedDamage)) {
      errors.push(`破损情况「${trimmedDamage}」不在可选值中`);
    }

    if (trimmedCode) {
      codeCountMap[trimmedCode] = (codeCountMap[trimmedCode] || 0) + 1;
    }

    validated.push({
      ...row,
      code: trimmedCode,
      duration: trimmedDuration,
      shift: trimmedShift || "正常",
      damage: trimmedDamage || "完好",
      note: trimmedNote,
      _durationNum: isNaN(durationNum) ? 0 : durationNum,
      errors,
      status: errors.length > 0 ? "error" : "ok",
      statusText: errors.join("；")
    });
  }

  const duplicateCodes = Object.entries(codeCountMap)
    .filter(([, count]) => count > 1)
    .map(([code]) => code);

  for (const row of validated) {
    if (row.status === "error") continue;
    if (duplicateCodes.includes(row.code)) {
      row.status = "dup";
      row.statusText = "CSV 内编号重复";
    } else if (existingCodes.includes(row.code)) {
      row.status = "dup";
      row.statusText = "与当前清单编号重复";
    }
  }

  return { validated, duplicateCodes };
}

function renderImportPreview(validated) {
  const okCount = validated.filter((r) => r.status === "ok").length;
  const dupCount = validated.filter((r) => r.status === "dup").length;
  const errCount = validated.filter((r) => r.status === "error").length;

  els.importPreviewStats.textContent = `有效 ${okCount} 行 · 重复 ${dupCount} 行 · 错误 ${errCount} 行`;
  els.importConfirmBtn.disabled = okCount === 0;

  els.importPreviewBody.innerHTML = validated
    .map((row) => {
      const rowClass = row.status === "error" ? "row-error" : row.status === "dup" ? "row-dup" : "row-ok";
      const statusClass = row.status === "error" ? "import-status-err" : row.status === "dup" ? "import-status-warn" : "import-status-ok";
      const statusLabel = row.status === "ok" ? "✓ 有效" : row.status === "dup" ? "⚠ 重复" : "✗ 错误";
      return `
        <tr class="${rowClass}">
          <td>${row.lineNum}</td>
          <td>${escapeHtml(row.code)}</td>
          <td>${escapeHtml(row.duration)}</td>
          <td>${escapeHtml(row.shift)}</td>
          <td>${escapeHtml(row.damage)}</td>
          <td>${escapeHtml(row.note)}</td>
          <td class="${statusClass}">${statusLabel}${row.statusText && row.status !== "ok" ? `<br/><span style="font-weight:400;font-size:11px">${escapeHtml(row.statusText)}</span>` : ""}</td>
        </tr>
      `;
    })
    .join("");

  els.importPreviewWrap.style.display = "flex";

  const errorItems = [];
  if (errCount > 0) errorItems.push(`${errCount} 行存在解析或数据错误，将跳过`);
  if (dupCount > 0) errorItems.push(`${dupCount} 行编号重复（CSV 内或与清单冲突），将跳过`);

  if (errorItems.length > 0) {
    els.importErrors.innerHTML = `<h4>⚠ 导入注意事项</h4><ul>${errorItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    els.importErrors.style.display = "block";
  } else {
    els.importErrors.style.display = "none";
  }
}

function handleImportParse() {
  let text = els.importCsvText.value.trim();
  const file = els.importCsvFile.files[0];

  if (!text && !file) {
    els.importErrors.innerHTML = `<h4>⚠ 请输入 CSV 文本或上传 CSV 文件</h4>`;
    els.importErrors.style.display = "block";
    els.importPreviewWrap.style.display = "none";
    return;
  }

  if (file && !text) {
    const reader = new FileReader();
    reader.onload = () => {
      text = reader.result;
      els.importCsvText.value = text;
      doParseAndPreview(text);
    };
    reader.onerror = () => {
      els.importErrors.innerHTML = `<h4>⚠ 文件读取失败</h4>`;
      els.importErrors.style.display = "block";
    };
    reader.readAsText(file, "UTF-8");
  } else {
    doParseAndPreview(text);
  }
}

function doParseAndPreview(text) {
  const rows = parseCsvText(text);
  if (rows.length === 0) {
    els.importErrors.innerHTML = `<h4>⚠ 未解析到有效行</h4><ul><li>请确认 CSV 每行至少4列：片段编号, 秒数, 颜色偏移, 破损情况</li></ul>`;
    els.importErrors.style.display = "block";
    els.importPreviewWrap.style.display = "none";
    return;
  }
  const { validated } = validateImportRows(rows);
  importParsedRows = validated;
  renderImportPreview(validated);
}

function handleImportConfirm() {
  const reel = getActiveReel();
  if (!reel) return;

  const okRows = importParsedRows.filter((r) => r.status === "ok");
  if (okRows.length === 0) return;

  if (!confirm(`确认将 ${okRows.length} 条有效片段导入当前放映清单「${reel.title}」？重复和错误行将跳过。`)) return;

  for (const row of okRows) {
    reel.segments.push({
      id: crypto.randomUUID(),
      code: row.code,
      duration: row._durationNum,
      shift: row.shift,
      damage: row.damage,
      note: row.note,
      thumb: ""
    });
  }

  closeImportModal();
  renderAll();
}

els.importBtn.addEventListener("click", openImportModal);
els.importModalClose.addEventListener("click", closeImportModal);
els.importModalBackdrop.addEventListener("click", closeImportModal);
els.importCancelBtn.addEventListener("click", closeImportModal);
els.importParseBtn.addEventListener("click", handleImportParse);
els.importConfirmBtn.addEventListener("click", handleImportConfirm);

els.importCsvFile.addEventListener("change", () => {
  const file = els.importCsvFile.files[0];
  if (file && !els.importCsvText.value.trim()) {
    const reader = new FileReader();
    reader.onload = () => {
      els.importCsvText.value = reader.result;
    };
    reader.readAsText(file, "UTF-8");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (els.importModal.classList.contains("open")) {
      closeImportModal();
    } else if (activeDrawerSegmentId) {
      closeDrawer();
    } else if (els.reelModal.classList.contains("open")) {
      closeReelModal();
    }
  }
});

renderAll();
