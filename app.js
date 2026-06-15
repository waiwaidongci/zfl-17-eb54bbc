const storageKey = "zfl17-film-strip-desk";

const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

const defaultState = {
  reelTitle: "春日试映A卷",
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
  templates: [
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
  ],
  checklist: []
};

let state = loadState();
let draggedId = null;
let activeDrawerSegmentId = null;
let drawerThumbDataUrl = "";

const els = {
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
  drawerDelete: document.querySelector("#drawerDelete")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    return { ...structuredClone(defaultState), ...JSON.parse(saved) };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getFilteredSegments() {
  const color = els.colorFilter.value;
  const keyword = els.searchInput.value.trim();
  return state.segments.filter((item) => {
    const matchesColor = color === "all" || item.shift === color;
    const matchesKeyword = !keyword || `${item.code}${item.note}${item.damage}`.includes(keyword);
    return matchesColor && matchesKeyword;
  });
}

function renderStats() {
  const total = state.segments.reduce((sum, item) => sum + Number(item.duration), 0);
  const damaged = state.segments.filter((item) => item.damage !== "完好").length;
  els.totalDuration.textContent = formatDuration(total);
  els.damageCount.textContent = damaged;
  els.segmentCount.textContent = state.segments.length;
}

function renderList() {
  const segments = getFilteredSegments();
  els.segmentList.innerHTML =
    segments
      .map((item, index) => {
        const realIndex = state.segments.findIndex((segment) => segment.id === item.id);
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
  const warnings = state.segments.filter((item) => item.damage !== "完好" || item.shift !== "正常");
  els.warningList.innerHTML =
    warnings
      .map((item) => {
        const index = state.segments.findIndex((segment) => segment.id === item.id) + 1;
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
  const problemSegments = state.segments.filter(
    (seg) => seg.damage !== "完好" || seg.shift !== "正常"
  );
  const existingAutoMap = {};
  state.checklist
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
  const manualItems = state.checklist.filter((item) => item.source === "manual");
  state.checklist = [...syncedAutoItems, ...manualItems];
}

function addChecklistItem(event) {
  event.preventDefault();
  const text = els.checklistInput.value.trim();
  if (!text) return;
  state.checklist.push({
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
  const item = state.checklist.find((c) => c.id === id);
  if (item) item.completed = !item.completed;
  renderAll();
}

function deleteChecklistItem(id) {
  state.checklist = state.checklist.filter((c) => c.id !== id);
  renderAll();
}

function renderChecklist() {
  const autoItems = state.checklist.filter((item) => item.source === "auto");
  const manualItems = state.checklist.filter((item) => item.source === "manual");
  const completed = state.checklist.filter((item) => item.completed).length;
  const total = state.checklist.length;
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

function renderAll() {
  els.reelTitle.value = state.reelTitle;
  renderStats();
  renderList();
  renderWarnings();
  renderTemplates();
  syncAutoChecklist();
  renderChecklist();
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
  const thumb = await readFileAsDataUrl(els.thumbInput.files[0]);
  state.segments.push({
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
  const index = state.segments.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.segments.length) return;
  const [item] = state.segments.splice(index, 1);
  state.segments.splice(target, 0, item);
  renderAll();
}

function exportList() {
  const lines = [
    `胶片卷：${state.reelTitle || "未命名胶片卷"}`,
    `总时长：${formatDuration(state.segments.reduce((sum, item) => sum + Number(item.duration), 0))}`,
    "",
    ...state.segments.map((item, index) => `${index + 1}. ${item.code}｜${formatDuration(item.duration)}｜${item.shift}｜${item.damage}｜${item.note || "无备注"}`)
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.reelTitle || "film-reel"}-checklist.txt`;
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
  const segment = state.segments.find((s) => s.id === segmentId);
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
  const realIndex = state.segments.findIndex((s) => s.id === segment.id);

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
  if (!activeDrawerSegmentId) return;

  const segmentIndex = state.segments.findIndex((s) => s.id === activeDrawerSegmentId);
  if (segmentIndex < 0) return;

  const file = els.drawerThumbInput.files[0];
  if (file) {
    drawerThumbDataUrl = await readFileAsDataUrl(file);
  }

  state.segments[segmentIndex] = {
    ...state.segments[segmentIndex],
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
  if (!activeDrawerSegmentId) return;
  if (!confirm("确定要删除此片段吗？此操作不可撤销。")) return;

  state.segments = state.segments.filter((s) => s.id !== activeDrawerSegmentId);
  renderAll();
  closeDrawer();
}

els.reelTitle.addEventListener("input", () => {
  state.reelTitle = els.reelTitle.value;
  saveState();
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
    state.segments = state.segments.filter((item) => item.id !== remove.dataset.delete);
    renderAll();
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
  const card = event.target.closest("[data-id]");
  if (!card || !draggedId || card.dataset.id === draggedId) return;
  event.preventDefault();
  const fromIndex = state.segments.findIndex((item) => item.id === draggedId);
  const toIndex = state.segments.findIndex((item) => item.id === card.dataset.id);
  if (fromIndex < 0 || toIndex < 0) return;
  const [item] = state.segments.splice(fromIndex, 1);
  state.segments.splice(toIndex, 0, item);
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeDrawerSegmentId) {
    closeDrawer();
  }
});

renderAll();
