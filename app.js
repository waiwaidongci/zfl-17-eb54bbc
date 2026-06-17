const storageKey = "zfl17-film-strip-desk";
const historyStorageKey = "zfl17-film-strip-desk-history";

const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

const MAX_HISTORY_SIZE = 50;
let els = {};

class HistoryManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.isExecuting = false;
    this.load();
  }

  execute(command) {
    if (this.isExecuting) return;

    this.isExecuting = true;
    try {
      command.execute();
      this.undoStack.push(command);
      this.redoStack = [];

      if (this.undoStack.length > MAX_HISTORY_SIZE) {
        this.undoStack.shift();
      }

      this.save();
      this.updateUI();
    } finally {
      this.isExecuting = false;
    }
  }

  undo() {
    if (this.undoStack.length === 0 || this.isExecuting) return;

    this.isExecuting = true;
    try {
      const command = this.undoStack.pop();
      command.undo();
      this.redoStack.push(command);
      this.save();
      this.updateUI();
    } finally {
      this.isExecuting = false;
    }
  }

  redo() {
    if (this.redoStack.length === 0 || this.isExecuting) return;

    this.isExecuting = true;
    try {
      const command = this.redoStack.pop();
      command.execute();
      this.undoStack.push(command);
      this.save();
      this.updateUI();
    } finally {
      this.isExecuting = false;
    }
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.save();
    this.updateUI();
  }

  save() {
    try {
      const serializable = {
        undoStack: this.undoStack.map((cmd) => cmd.serialize()),
        redoStack: this.redoStack.map((cmd) => cmd.serialize())
      };
      localStorage.setItem(historyStorageKey, JSON.stringify(serializable));
    } catch (e) {
      console.warn("Failed to save history:", e);
    }
  }

  load() {
    try {
      const saved = localStorage.getItem(historyStorageKey);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (parsed.undoStack) {
        this.undoStack = parsed.undoStack
          .map((data) => this.deserialize(data))
          .filter(Boolean);
      }
      if (parsed.redoStack) {
        this.redoStack = parsed.redoStack
          .map((data) => this.deserialize(data))
          .filter(Boolean);
      }
    } catch (e) {
      console.warn("Failed to load history:", e);
      this.undoStack = [];
      this.redoStack = [];
    }
  }

  deserialize(data) {
    if (!data || !data.type) return null;

    switch (data.type) {
      case "addSegment":
        return new AddSegmentCommand(data.reelId, data.segment, data.index);
      case "deleteSegment":
        return new DeleteSegmentCommand(data.reelId, data.segment, data.index);
      case "editSegment":
        return new EditSegmentCommand(data.reelId, data.segmentId, data.oldData, data.newData);
      case "moveSegment":
        return new MoveSegmentCommand(data.reelId, data.fromIndex, data.toIndex);
      case "batchImport":
        return new BatchImportCommand(data.reelId, data.segments, data.startIndex);
      case "addReel":
        return new AddReelCommand(data.reel);
      case "deleteReel":
        return new DeleteReelCommand(data.reel, data.index, data.previousActiveId);
      case "renameReel":
        return new RenameReelCommand(data.reelId, data.oldTitle, data.newTitle);
      case "duplicateReel":
        return new DuplicateReelCommand(data.sourceReelId, data.newReel);
      case "switchReel":
        return new SwitchReelCommand(data.oldActiveId, data.newActiveId);
      case "archiveReel":
        return new ArchiveReelCommand(data.reelId, data.previousActiveId, data.targetArchived);
      default:
        return null;
    }
  }

  updateUI() {
    if (els.undoBtn) {
      els.undoBtn.disabled = !this.canUndo();
      els.undoBtn.title = this.canUndo()
        ? `撤销：${this.undoStack[this.undoStack.length - 1]?.getLabel() || "上一步操作"} (Ctrl+Z)`
        : "没有可撤销的操作";
    }
    if (els.redoBtn) {
      els.redoBtn.disabled = !this.canRedo();
      els.redoBtn.title = this.canRedo()
        ? `重做：${this.redoStack[this.redoStack.length - 1]?.getLabel() || "上一步操作"} (Ctrl+Shift+Z)`
        : "没有可重做的操作";
    }
    if (els.historyStatus) {
      els.historyStatus.textContent = `历史记录：${this.undoStack.length} 步`;
    }
  }
}

class BaseCommand {
  constructor(type) {
    this.type = type;
    this.timestamp = Date.now();
  }

  execute() {}
  undo() {}
  getLabel() {
    return this.type;
  }
  serialize() {
    return {
      type: this.type,
      timestamp: this.timestamp,
      ...this._getData()
    };
  }
  _getData() {
    return {};
  }
}

class AddSegmentCommand extends BaseCommand {
  constructor(reelId, segment, index = null) {
    super("addSegment");
    this.reelId = reelId;
    this.segment = structuredClone(segment);
    this.index = index;
  }

  execute() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;

    if (this.index !== null && this.index >= 0 && this.index <= reel.segments.length) {
      reel.segments.splice(this.index, 0, this.segment);
    } else {
      reel.segments.push(this.segment);
      this.index = reel.segments.length - 1;
    }
    renderAll();
  }

  undo() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;

    if (this.index !== null && this.index >= 0 && this.index < reel.segments.length) {
      reel.segments.splice(this.index, 1);
    } else {
      reel.segments = reel.segments.filter((s) => s.id !== this.segment.id);
    }
    renderAll();
  }

  getLabel() {
    return `新增片段 ${this.segment.code}`;
  }

  _getData() {
    return {
      reelId: this.reelId,
      segment: this.segment,
      index: this.index
    };
  }
}

class DeleteSegmentCommand extends BaseCommand {
  constructor(reelId, segment, index) {
    super("deleteSegment");
    this.reelId = reelId;
    this.segment = structuredClone(segment);
    this.index = index;
  }

  execute() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;
    reel.segments = reel.segments.filter((s) => s.id !== this.segment.id);
    renderAll();
  }

  undo() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;

    if (this.index !== null && this.index >= 0 && this.index <= reel.segments.length) {
      reel.segments.splice(this.index, 0, this.segment);
    } else {
      reel.segments.push(this.segment);
    }
    renderAll();
  }

  getLabel() {
    return `删除片段 ${this.segment.code}`;
  }

  _getData() {
    return {
      reelId: this.reelId,
      segment: this.segment,
      index: this.index
    };
  }
}

class EditSegmentCommand extends BaseCommand {
  constructor(reelId, segmentId, oldData, newData) {
    super("editSegment");
    this.reelId = reelId;
    this.segmentId = segmentId;
    this.oldData = structuredClone(oldData);
    this.newData = structuredClone(newData);
  }

  execute() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;
    const segment = reel.segments.find((s) => s.id === this.segmentId);
    if (!segment) return;

    Object.assign(segment, this.newData);
    renderAll();
  }

  undo() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;
    const segment = reel.segments.find((s) => s.id === this.segmentId);
    if (!segment) return;

    Object.assign(segment, this.oldData);
    renderAll();
  }

  getLabel() {
    return `编辑片段 ${this.oldData.code || this.newData.code}`;
  }

  _getData() {
    return {
      reelId: this.reelId,
      segmentId: this.segmentId,
      oldData: this.oldData,
      newData: this.newData
    };
  }
}

class MoveSegmentCommand extends BaseCommand {
  constructor(reelId, fromIndex, toIndex) {
    super("moveSegment");
    this.reelId = reelId;
    this.fromIndex = fromIndex;
    this.toIndex = toIndex;
  }

  execute() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;
    const [item] = reel.segments.splice(this.fromIndex, 1);
    reel.segments.splice(this.toIndex, 0, item);
    renderAll();
  }

  undo() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;
    const [item] = reel.segments.splice(this.toIndex, 1);
    reel.segments.splice(this.fromIndex, 0, item);
    renderAll();
  }

  getLabel() {
    return `移动片段（位置 ${this.fromIndex + 1} → ${this.toIndex + 1}）`;
  }

  _getData() {
    return {
      reelId: this.reelId,
      fromIndex: this.fromIndex,
      toIndex: this.toIndex
    };
  }
}

class BatchImportCommand extends BaseCommand {
  constructor(reelId, segments, startIndex = null) {
    super("batchImport");
    this.reelId = reelId;
    this.segments = structuredClone(segments);
    this.startIndex = startIndex;
  }

  execute() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;

    if (this.startIndex === null) {
      this.startIndex = reel.segments.length;
    }

    this.segments.forEach((seg, i) => {
      reel.segments.splice(this.startIndex + i, 0, seg);
    });
    renderAll();
  }

  undo() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;

    if (this.startIndex !== null) {
      reel.segments.splice(this.startIndex, this.segments.length);
    } else {
      const segmentIds = new Set(this.segments.map((s) => s.id));
      reel.segments = reel.segments.filter((s) => !segmentIds.has(s.id));
    }
    renderAll();
  }

  getLabel() {
    return `批量导入 ${this.segments.length} 个片段`;
  }

  _getData() {
    return {
      reelId: this.reelId,
      segments: this.segments,
      startIndex: this.startIndex
    };
  }
}

class AddReelCommand extends BaseCommand {
  constructor(reel) {
    super("addReel");
    this.reel = structuredClone(reel);
  }

  execute() {
    state.reels.push(this.reel);
    state.activeReelId = this.reel.id;
    renderAll();
  }

  undo() {
    state.reels = state.reels.filter((r) => r.id !== this.reel.id);
    if (state.activeReelId === this.reel.id && state.reels.length > 0) {
      state.activeReelId = state.reels[0].id;
    }
    renderAll();
  }

  getLabel() {
    return `新建胶片卷「${this.reel.title}」`;
  }

  _getData() {
    return { reel: this.reel };
  }
}

class DeleteReelCommand extends BaseCommand {
  constructor(reel, index, previousActiveId) {
    super("deleteReel");
    this.reel = structuredClone(reel);
    this.index = index;
    this.previousActiveId = previousActiveId;
  }

  execute() {
    state.reels = state.reels.filter((r) => r.id !== this.reel.id);
    if (state.activeReelId === this.reel.id && state.reels.length > 0) {
      state.activeReelId = state.reels[0].id;
    }
    renderAll();
  }

  undo() {
    state.reels.splice(this.index, 0, this.reel);
    state.activeReelId = this.previousActiveId;
    renderAll();
  }

  getLabel() {
    return `删除胶片卷「${this.reel.title}」`;
  }

  _getData() {
    return {
      reel: this.reel,
      index: this.index,
      previousActiveId: this.previousActiveId
    };
  }
}

class RenameReelCommand extends BaseCommand {
  constructor(reelId, oldTitle, newTitle) {
    super("renameReel");
    this.reelId = reelId;
    this.oldTitle = oldTitle;
    this.newTitle = newTitle;
  }

  execute() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;
    reel.title = this.newTitle;
    renderAll();
  }

  undo() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;
    reel.title = this.oldTitle;
    renderAll();
  }

  getLabel() {
    return `重命名胶片卷「${this.oldTitle}」→「${this.newTitle}」`;
  }

  _getData() {
    return {
      reelId: this.reelId,
      oldTitle: this.oldTitle,
      newTitle: this.newTitle
    };
  }
}

class ArchiveReelCommand extends BaseCommand {
  constructor(reelId, previousActiveId, targetArchived) {
    super("archiveReel");
    this.reelId = reelId;
    this.previousActiveId = previousActiveId;
    this.targetArchived = targetArchived;
  }

  execute() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;
    reel.archived = this.targetArchived;

    if (this.targetArchived && state.activeReelId === this.reelId) {
      const firstActive = state.reels.find((r) => !r.archived);
      if (firstActive) {
        state.activeReelId = firstActive.id;
      }
    }

    renderAll();
  }

  undo() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    if (!reel) return;
    reel.archived = !this.targetArchived;

    if (!this.targetArchived && state.activeReelId === this.reelId) {
      const firstActive = state.reels.find((r) => !r.archived);
      if (firstActive) {
        state.activeReelId = firstActive.id;
      }
    } else if (this.previousActiveId) {
      state.activeReelId = this.previousActiveId;
    }

    renderAll();
  }

  getLabel() {
    const reel = state.reels.find((r) => r.id === this.reelId);
    const title = reel ? reel.title : "";
    return this.targetArchived ? `归档胶片卷「${title}」` : `恢复胶片卷「${title}」`;
  }

  _getData() {
    return {
      reelId: this.reelId,
      previousActiveId: this.previousActiveId,
      targetArchived: this.targetArchived
    };
  }
}

class DuplicateReelCommand extends BaseCommand {
  constructor(sourceReelId, newReel) {
    super("duplicateReel");
    this.sourceReelId = sourceReelId;
    this.newReel = structuredClone(newReel);
  }

  execute() {
    state.reels.push(this.newReel);
    state.activeReelId = this.newReel.id;
    renderAll();
  }

  undo() {
    state.reels = state.reels.filter((r) => r.id !== this.newReel.id);
    state.activeReelId = this.sourceReelId;
    renderAll();
  }

  getLabel() {
    return `复制胶片卷「${this.newReel.title}」`;
  }

  _getData() {
    return {
      sourceReelId: this.sourceReelId,
      newReel: this.newReel
    };
  }
}

class SwitchReelCommand extends BaseCommand {
  constructor(oldActiveId, newActiveId) {
    super("switchReel");
    this.oldActiveId = oldActiveId;
    this.newActiveId = newActiveId;
  }

  execute() {
    state.activeReelId = this.newActiveId;
    renderAll();
  }

  undo() {
    state.activeReelId = this.oldActiveId;
    renderAll();
  }

  getLabel() {
    const oldReel = state.reels.find((r) => r.id === this.oldActiveId);
    const newReel = state.reels.find((r) => r.id === this.newActiveId);
    return `切换胶片卷「${oldReel?.title || ""}」→「${newReel?.title || ""}」`;
  }

  _getData() {
    return {
      oldActiveId: this.oldActiveId,
      newActiveId: this.newActiveId
    };
  }
}

const history = new HistoryManager();

// 风险评分规则和计算函数已移至 risk-rules.js 集中维护
// 请编辑 risk-rules.js 文件调整评分标准

function createDefaultReel(title = "春日试映A卷") {
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: Date.now(),
    archived: false,
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
    version: 3,
    activeReelId: firstReel.id,
    reels: [firstReel],
    templates: structuredClone(defaultTemplates)
  };
}

function migrateLegacyState(saved) {
  if (!saved) return null;
  if (saved.version === 3 && Array.isArray(saved.reels)) return null;

  let migrated = structuredClone(saved);

  if (saved.version === undefined || !Array.isArray(saved.reels)) {
    const defaultWs = createDefaultWorkspace();
    migrated = structuredClone(defaultWs);
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
        id: item.id || crypto.randomUUID(),
        priority: item.priority || "normal"
      }));
    }
    if (Array.isArray(saved.templates)) {
      migrated.templates = saved.templates.map((tpl) => ({
        ...tpl,
        id: tpl.id || crypto.randomUUID()
      }));
    }
    migrated.activeReelId = legacyReel.id;
    migrated.version = 2;
  }

  if (migrated.version === 2) {
    if (Array.isArray(migrated.reels)) {
      migrated.reels.forEach((reel) => {
        if (reel.archived === undefined) {
          reel.archived = false;
        }
      });
    }
    migrated.version = 3;
  }

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
  const result = {
    ...defaults,
    ...parsed,
    templates: Array.isArray(parsed.templates) && parsed.templates.length > 0
      ? parsed.templates
      : defaults.templates
  };

  result.reels.forEach((reel) => {
    if (reel.archived === undefined) {
      reel.archived = false;
    }
    if (Array.isArray(reel.checklist)) {
      reel.checklist = reel.checklist.map((item) => ({
        priority: "normal",
        ...item
      }));
    }
  });

  return result;
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getActiveReel() {
  let reel = state.reels.find((r) => r.id === state.activeReelId && !r.archived);
  if (!reel) {
    reel = state.reels.find((r) => !r.archived);
    if (reel) {
      state.activeReelId = reel.id;
    }
  }
  return reel;
}

let state = loadState();
let draggedId = null;
let dragStartIndex = -1;
let dragReelId = null;
let activeDrawerSegmentId = null;
let drawerThumbDataUrl = "";
let pendingTemplateSegmentData = null;
let reelListTab = "active";

function collectElements() {
  els = {
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
    reelTabBar: document.querySelector(".reel-tab-bar"),

    undoBtn: document.querySelector("#undoBtn"),
    redoBtn: document.querySelector("#redoBtn"),
    historyStatus: document.querySelector("#historyStatus"),

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
    checklistPriority: document.querySelector("#checklistPriority"),
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
    importSelectAll: document.querySelector("#importSelectAll"),
    importConfirmBtn: document.querySelector("#importConfirmBtn"),
    importCancelBtn: document.querySelector("#importCancelBtn"),
    timelineBar: document.querySelector("#timelineBar"),
    timelineScroll: document.querySelector("#timelineScroll"),
    timelineFilterHint: document.querySelector("#timelineFilterHint"),
    timelineTooltip: document.querySelector("#timelineTooltip"),

    backupBtn: document.querySelector("#backupBtn"),
    backupModalBackdrop: document.querySelector("#backupModalBackdrop"),
    backupModal: document.querySelector("#backupModal"),
    backupModalClose: document.querySelector("#backupModalClose"),
    backupExportBtn: document.querySelector("#backupExportBtn"),
    backupReelCount: document.querySelector("#backupReelCount"),
    backupSegmentCount: document.querySelector("#backupSegmentCount"),
    backupTemplateCount: document.querySelector("#backupTemplateCount"),
    backupFileInput: document.querySelector("#backupFileInput"),
    backupErrors: document.querySelector("#backupErrors"),
    backupWarnings: document.querySelector("#backupWarnings"),
    backupPreviewWrap: document.querySelector("#backupPreviewWrap"),
    backupVersionBadge: document.querySelector("#backupVersionBadge"),
    previewReelCount: document.querySelector("#previewReelCount"),
    previewSegmentCount: document.querySelector("#previewSegmentCount"),
    previewTemplateCount: document.querySelector("#previewTemplateCount"),
    previewExportTime: document.querySelector("#previewExportTime"),
    backupConflictInfo: document.querySelector("#backupConflictInfo"),
    backupConflictText: document.querySelector("#backupConflictText"),
    backupConfirmBtn: document.querySelector("#backupConfirmBtn"),
    backupCancelBtn: document.querySelector("#backupCancelBtn"),

    highRiskCount: document.querySelector("#highRiskCount"),
    riskOverviewStats: document.querySelector("#riskOverviewStats"),
    riskSummaryBar: document.querySelector("#riskSummaryBar"),
    riskDetailList: document.querySelector("#riskDetailList"),

    reportBtn: document.querySelector("#reportBtn"),

    drawerSaveTemplate: document.querySelector("#drawerSaveTemplate"),
    saveTplModalBackdrop: document.querySelector("#saveTplModalBackdrop"),
    saveTplModal: document.querySelector("#saveTplModal"),
    saveTplModalClose: document.querySelector("#saveTplModalClose"),
    saveTplForm: document.querySelector("#saveTplForm"),
    saveTplNameInput: document.querySelector("#saveTplNameInput"),
    saveTplNoteInput: document.querySelector("#saveTplNoteInput"),
    saveTplPreviewDuration: document.querySelector("#saveTplPreviewDuration"),
    saveTplPreviewShift: document.querySelector("#saveTplPreviewShift"),
    saveTplPreviewDamage: document.querySelector("#saveTplPreviewDamage"),
    saveTplPreviewNote: document.querySelector("#saveTplPreviewNote"),
    saveTplCancelBtn: document.querySelector("#saveTplCancelBtn"),

    riskRulesBtn: document.querySelector("#riskRulesBtn"),
    riskRulesModalBackdrop: document.querySelector("#riskRulesModalBackdrop"),
    riskRulesModal: document.querySelector("#riskRulesModal"),
    riskRulesModalClose: document.querySelector("#riskRulesModalClose"),
    riskRulesSaveBtn: document.querySelector("#riskRulesSaveBtn"),
    riskRulesCancelBtn: document.querySelector("#riskRulesCancelBtn"),
    riskRulesResetBtn: document.querySelector("#riskRulesResetBtn"),
    riskRulesErrors: document.querySelector("#riskRulesErrors"),
    shiftRulesGrid: document.querySelector("#shiftRulesGrid"),
    damageRulesGrid: document.querySelector("#damageRulesGrid"),
    durationRulesList: document.querySelector("#durationRulesList"),
    keywordsRulesList: document.querySelector("#keywordsRulesList"),
    levelsRulesList: document.querySelector("#levelsRulesList")
  };
}

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
    els.highRiskCount.textContent = "0";
    return;
  }
  const total = reel.segments.reduce((sum, item) => sum + Number(item.duration), 0);
  const damaged = reel.segments.filter((item) => item.damage !== "完好").length;
  const highRisk = reel.segments.filter((item) => calculateSegmentRisk(item).css === "risk-high").length;
  els.totalDuration.textContent = formatDuration(total);
  els.damageCount.textContent = damaged;
  els.segmentCount.textContent = reel.segments.length;
  els.highRiskCount.textContent = highRisk;
}

function renderReelHeader() {
  const reel = getActiveReel();
  const activeReelCount = state.reels.filter((r) => !r.archived).length;
  els.activeReelName.textContent = reel ? reel.title : "—";
  els.reelCountBadge.textContent = `${activeReelCount} 卷`;
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
        const risk = calculateSegmentRisk(item);
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
                <span class="risk-badge ${risk.css}">${risk.label}</span>
              </div>
              <div class="tag-row">
                <span class="tag">${escapeHtml(item.shift)}</span>
                <span class="tag ${hasDamage ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>
              </div>
              <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
            </div>
            <div class="segment-actions">
              <button type="button" title="存为模板" data-save-template="${item.id}">📋</button>
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
        const risk = calculateSegmentRisk(item);
        const reasons = [item.shift !== "正常" ? item.shift : "", item.damage !== "完好" ? item.damage : ""].filter(Boolean).join(" · ");
        return `
          <div class="warning-item">
            <div class="warning-item-head">
              <strong>${index}. ${escapeHtml(item.code)}</strong>
              <span class="risk-badge ${risk.css}">${risk.label} ${risk.score}分</span>
            </div>
            <span>${escapeHtml(reasons)}${item.note ? `：${escapeHtml(item.note)}` : ""}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">当前清单没有颜色偏移或破损提醒。</p>`;
}

function renderRiskOverview() {
  const reel = getActiveReel();
  if (!reel) {
    els.riskOverviewStats.textContent = "—";
    els.riskSummaryBar.innerHTML = "";
    els.riskDetailList.innerHTML = `<p class="empty">当前没有胶片卷。</p>`;
    return;
  }

  const riskResults = reel.segments.map((seg) => ({
    segment: seg,
    risk: calculateSegmentRisk(seg)
  }));

  const safeCount = riskResults.filter((r) => r.risk.css === "risk-safe").length;
  const lowCount = riskResults.filter((r) => r.risk.css === "risk-low").length;
  const mediumCount = riskResults.filter((r) => r.risk.css === "risk-medium").length;
  const highCount = riskResults.filter((r) => r.risk.css === "risk-high").length;
  const total = riskResults.length;

  els.riskOverviewStats.textContent = `高风险 ${highCount} · 中风险 ${mediumCount} · 低风险 ${lowCount} · 安全 ${safeCount}`;

  if (total === 0) {
    els.riskSummaryBar.innerHTML = "";
    els.riskDetailList.innerHTML = `<p class="empty">暂无片段数据。</p>`;
    return;
  }

  els.riskSummaryBar.innerHTML = `
    <div class="risk-bar-track">
      ${safeCount > 0 ? `<div class="risk-bar-segment risk-bar-safe" style="width:${(safeCount / total) * 100}%" title="安全 ${safeCount}个"></div>` : ""}
      ${lowCount > 0 ? `<div class="risk-bar-segment risk-bar-low" style="width:${(lowCount / total) * 100}%" title="低风险 ${lowCount}个"></div>` : ""}
      ${mediumCount > 0 ? `<div class="risk-bar-segment risk-bar-medium" style="width:${(mediumCount / total) * 100}%" title="中风险 ${mediumCount}个"></div>` : ""}
      ${highCount > 0 ? `<div class="risk-bar-segment risk-bar-high" style="width:${(highCount / total) * 100}%" title="高风险 ${highCount}个"></div>` : ""}
    </div>
    <div class="risk-bar-labels">
      ${safeCount > 0 ? `<span class="risk-bar-label risk-bar-label-safe">安全 ${safeCount}</span>` : ""}
      ${lowCount > 0 ? `<span class="risk-bar-label risk-bar-label-low">低 ${lowCount}</span>` : ""}
      ${mediumCount > 0 ? `<span class="risk-bar-label risk-bar-label-medium">中 ${mediumCount}</span>` : ""}
      ${highCount > 0 ? `<span class="risk-bar-label risk-bar-label-high">高 ${highCount}</span>` : ""}
    </div>
  `;

  const riskyItems = riskResults.filter((r) => r.risk.score > 0).sort((a, b) => b.risk.score - a.risk.score);

  if (riskyItems.length === 0) {
    els.riskDetailList.innerHTML = `<p class="empty">所有片段均为安全等级，暂无风险项。</p>`;
    return;
  }

  els.riskDetailList.innerHTML = riskyItems
    .map(({ segment, risk }) => {
      const idx = reel.segments.findIndex((s) => s.id === segment.id) + 1;
      return `
        <div class="risk-detail-item ${risk.css}">
          <div class="risk-detail-head">
            <strong>${idx}. ${escapeHtml(segment.code)}</strong>
            <span class="risk-badge ${risk.css}">${risk.label} ${risk.score}分</span>
          </div>
          <div class="risk-detail-info">
            <span class="risk-detail-meta">${formatDuration(segment.duration)} · ${escapeHtml(segment.shift)} · ${escapeHtml(segment.damage)}</span>
          </div>
          <div class="risk-detail-reasons">
            ${risk.reasons.map((r) => `<span class="risk-reason-tag">${escapeHtml(r)}</span>`).join("")}
          </div>
        </div>
      `;
    })
    .join("");
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

function openSaveTemplateModal(segmentId) {
  const reel = getActiveReel();
  if (!reel) return;
  const segment = reel.segments.find((s) => s.id === segmentId);
  if (!segment) return;

  pendingTemplateSegmentData = {
    id: segment.id,
    code: segment.code,
    duration: segment.duration,
    shift: segment.shift,
    damage: segment.damage,
    note: segment.note || ""
  };

  els.saveTplNameInput.value = `${segment.code} 片段配置`;
  els.saveTplNoteInput.value = segment.note || "";
  els.saveTplPreviewDuration.textContent = formatDuration(segment.duration);
  els.saveTplPreviewShift.textContent = segment.shift;
  els.saveTplPreviewDamage.textContent = segment.damage;
  els.saveTplPreviewNote.textContent = segment.note ? escapeHtml(segment.note) : "（无）";

  els.saveTplModalBackdrop.classList.add("open");
  els.saveTplModal.classList.add("open");
  els.saveTplModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => els.saveTplNameInput.focus(), 50);
}

function closeSaveTemplateModal() {
  pendingTemplateSegmentData = null;
  els.saveTplModalBackdrop.classList.remove("open");
  els.saveTplModal.classList.remove("open");
  els.saveTplModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  els.saveTplForm.reset();
}

function saveTemplateFromSegment(event) {
  event.preventDefault();
  if (!pendingTemplateSegmentData) return;

  const name = els.saveTplNameInput.value.trim();
  if (!name) return;

  const notePrefix = els.saveTplNoteInput.value.trim();

  state.templates.push({
    id: crypto.randomUUID(),
    name,
    duration: Number(pendingTemplateSegmentData.duration),
    shift: pendingTemplateSegmentData.shift,
    damage: pendingTemplateSegmentData.damage,
    notePrefix
  });

  closeSaveTemplateModal();
  renderAll();
}

function riskScoreToPriority(score) {
  if (score >= 7) return "urgent";
  if (score >= 4) return "important";
  return "normal";
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
    const risk = calculateSegmentRisk(seg);
    const priority = riskScoreToPriority(risk.score);
    if (existing) {
      existing.text = `${seg.code}（${reasons}）`;
      existing.priority = priority;
      syncedAutoItems.push(existing);
    } else {
      syncedAutoItems.push({
        id: crypto.randomUUID(),
        text: `${seg.code}（${reasons}）`,
        source: "auto",
        segmentId: seg.id,
        completed: false,
        priority
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
  const priority = els.checklistPriority?.value || "normal";
  reel.checklist.push({
    id: crypto.randomUUID(),
    text,
    source: "manual",
    segmentId: null,
    completed: false,
    priority
  });
  els.checklistForm.reset();
  els.checklistPriority.value = "normal";
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

function getPriorityLabel(priority) {
  const labels = { urgent: "紧急", important: "重要", normal: "普通" };
  return labels[priority] || "普通";
}

function sortByPriority(items) {
  const priorityOrder = { urgent: 0, important: 1, normal: 2 };
  return [...items].sort((a, b) => {
    const orderA = priorityOrder[a.priority] ?? 2;
    const orderB = priorityOrder[b.priority] ?? 2;
    return orderA - orderB;
  });
}

function renderChecklist() {
  const reel = getActiveReel();
  if (!reel) {
    els.checklistStats.textContent = "0 / 0 项已完成";
    els.autoChecklist.innerHTML = `<p class="empty">无胶片卷。</p>`;
    els.manualChecklist.innerHTML = `<p class="empty">无胶片卷。</p>`;
    return;
  }
  const autoItems = sortByPriority(reel.checklist.filter((item) => item.source === "auto"));
  const manualItems = sortByPriority(reel.checklist.filter((item) => item.source === "manual"));
  const completed = reel.checklist.filter((item) => item.completed).length;
  const total = reel.checklist.length;
  els.checklistStats.textContent = `${completed} / ${total} 项已完成`;

  els.autoChecklist.innerHTML =
    autoItems
      .map((item) => {
        const checkedClass = item.completed ? "checked" : "";
        const priorityClass = `priority-${item.priority || "normal"}-border`;
        const priorityBadgeClass = `priority-badge priority-${item.priority || "normal"}`;
        return `
          <div class="checklist-item auto-item ${checkedClass} ${priorityClass}" data-check-id="${item.id}">
            <label class="checklist-checkbox">
              <input type="checkbox" ${item.completed ? "checked" : ""} data-toggle-check="${item.id}" />
              <span class="checkmark"></span>
            </label>
            <span class="checklist-text">${escapeHtml(item.text)}</span>
            <span class="${priorityBadgeClass}">${getPriorityLabel(item.priority)}</span>
            <span class="checklist-badge auto-badge">自动</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">当前无破损或颜色偏移片段，无需自动待办。</p>`;

  els.manualChecklist.innerHTML =
    manualItems
      .map((item) => {
        const checkedClass = item.completed ? "checked" : "";
        const priorityClass = `priority-${item.priority || "normal"}-border`;
        const priorityBadgeClass = `priority-badge priority-${item.priority || "normal"}`;
        return `
          <div class="checklist-item manual-item ${checkedClass} ${priorityClass}" data-check-id="${item.id}">
            <label class="checklist-checkbox">
              <input type="checkbox" ${item.completed ? "checked" : ""} data-toggle-check="${item.id}" />
              <span class="checkmark"></span>
            </label>
            <span class="checklist-text">${escapeHtml(item.text)}</span>
            <span class="${priorityBadgeClass}">${getPriorityLabel(item.priority)}</span>
            <button type="button" class="checklist-delete" title="删除检查项" data-delete-check="${item.id}">×</button>
          </div>
        `;
      })
      .join("") || `<p class="empty">暂无临时检查项，可在上方输入添加。</p>`;
}

function renderReelList() {
  const filteredReels = state.reels.filter((r) =>
    reelListTab === "active" ? !r.archived : r.archived
  );
  const totalActive = state.reels.filter((r) => !r.archived).length;
  const totalArchived = state.reels.filter((r) => r.archived).length;

  els.reelListTip.textContent =
    reelListTab === "active"
      ? `共 ${totalActive} 卷`
      : `共 ${totalArchived} 卷`;

  if (els.reelTabBar) {
    els.reelTabBar.querySelectorAll(".reel-tab").forEach((tab) => {
      const tabType = tab.dataset.reelTab;
      tab.classList.toggle("active", tabType === reelListTab);
    });
  }

  els.reelList.innerHTML =
    filteredReels
      .map((reel) => {
        const isActive = reel.id === state.activeReelId;
        const segCount = reel.segments.length;
        const totalDuration = reel.segments.reduce((sum, s) => sum + Number(s.duration), 0);
        const date = new Date(reel.createdAt);
        const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
        return `
          <div class="reel-card ${isActive ? "active" : ""} ${reel.archived ? "archived" : ""}" data-reel-id="${reel.id}">
            <div class="reel-card-indicator" title="${isActive ? "当前工作卷" : "点击切换"}"></div>
            <div class="reel-card-main">
              <div class="reel-card-title-row">
                <span class="reel-card-title" data-reel-title="${reel.id}">${escapeHtml(reel.title)}</span>
                ${isActive ? `<span class="reel-badge active-badge">当前工作卷</span>` : ""}
                ${reel.archived ? `<span class="reel-badge archive-badge">已归档</span>` : ""}
              </div>
              <div class="reel-card-meta">
                <span>📽️ ${segCount} 个片段</span>
                <span>⏱️ ${formatDuration(totalDuration)}</span>
                <span>📅 ${dateStr}</span>
              </div>
            </div>
            <div class="reel-card-actions">
              ${
                reel.archived
                  ? `
              <button type="button" class="reel-action-btn" title="恢复此卷" data-restore-reel="${reel.id}">↺</button>
              `
                  : `
              <button type="button" class="reel-action-btn switch-btn" title="${isActive ? "正在使用" : "切换到此卷"}" data-switch-reel="${reel.id}" ${isActive ? "disabled" : ""}>
                ${isActive ? "✓" : "↻"}
              </button>
              <button type="button" class="reel-action-btn" title="重命名" data-rename-reel="${reel.id}">✎</button>
              <button type="button" class="reel-action-btn" title="复制此卷" data-duplicate-reel="${reel.id}">⎘</button>
              <button type="button" class="reel-action-btn archive-btn" title="归档此卷" data-archive-reel="${reel.id}">📦</button>
              `
              }
              <button type="button" class="reel-action-btn delete-btn" title="删除此卷" data-delete-reel="${reel.id}">🗑</button>
            </div>
          </div>
        `;
      })
      .join("") ||
    `<div class="reel-card-empty">${
      reelListTab === "active" ? "还没有胶片卷，请在上方新建。" : "暂无归档的胶片卷。"
    }</div>`;
}

function shiftToColor(shift) {
  const map = { "正常": "#347d89", "偏红": "#b54d48", "偏青": "#3ea5a0", "偏黄": "#c9a84c", "褪色": "#8a8580" };
  return map[shift] || "#347d89";
}

function renderTimeline() {
  const reel = getActiveReel();
  if (!reel || reel.segments.length === 0) {
    els.timelineBar.innerHTML = `<p class="empty">暂无片段，无法绘制时间轴。</p>`;
    els.timelineFilterHint.textContent = "";
    return;
  }

  const filtered = getFilteredSegments();
  const filteredIds = new Set(filtered.map((s) => s.id));
  const totalDuration = reel.segments.reduce((sum, s) => sum + Number(s.duration), 0);
  const visibleDuration = filtered.reduce((sum, s) => sum + Number(s.duration), 0);
  const hiddenDuration = totalDuration - visibleDuration;
  const diffDuration = Math.abs(visibleDuration - hiddenDuration);
  const isFiltering = els.colorFilter.value !== "all" || els.searchInput.value.trim() !== "";

  if (isFiltering && (hiddenDuration > 0 || visibleDuration < totalDuration)) {
    els.timelineFilterHint.textContent = `总 ${formatDuration(totalDuration)} · 可见 ${formatDuration(visibleDuration)} · 隐藏 ${formatDuration(hiddenDuration)} · 差值 ${formatDuration(diffDuration)}`;
  } else {
    els.timelineFilterHint.textContent = "";
  }

  const pxPerSecond = 14;
  const minBlockPx = 56;

  els.timelineBar.innerHTML = reel.segments
    .map((seg) => {
      const visible = filteredIds.has(seg.id);
      const widthPx = Math.max(minBlockPx, Number(seg.duration) * pxPerSecond);
      const bg = shiftToColor(seg.shift);
      const hasDamage = seg.damage !== "完好";
      const opacityClass = isFiltering && !visible ? "timeline-dimmed" : "timeline-visible";
      const damageClass = hasDamage ? "timeline-damaged" : "";
      const idx = reel.segments.findIndex((s) => s.id === seg.id) + 1;
      const risk = calculateSegmentRisk(seg);
      const noteExcerpt = seg.note ? seg.note.substring(0, 40) + (seg.note.length > 40 ? "…" : "") : "—";
      const riskLabel = `${risk.score}分 · ${risk.label}`;
      return `<div class="timeline-block ${opacityClass} ${damageClass}" style="width:${widthPx}px;background:${bg}" data-timeline-id="${seg.id}" data-seg-index="${idx}" data-seg-code="${escapeHtml(seg.code)}" data-seg-duration="${formatDuration(seg.duration)}" data-seg-risk="${escapeHtml(riskLabel)}" data-seg-risk-score="${risk.score}" data-seg-risk-css="${risk.css}" data-seg-note="${escapeHtml(noteExcerpt)}" data-seg-shift="${escapeHtml(seg.shift)}" data-seg-damage="${escapeHtml(seg.damage)}" data-seg-hidden="${isFiltering && !visible ? "1" : "0"}"><span class="timeline-block-code">${escapeHtml(seg.code)}</span><span class="timeline-risk-badge ${risk.css}">${risk.score}</span>${hasDamage ? `<span class="timeline-damage-icon">⚠</span>` : ""}<span class="timeline-duration">${formatDuration(seg.duration)}</span></div>`;
    })
    .join("");
}

function renderAll() {
  renderReelHeader();
  renderStats();
  renderList();
  renderTimeline();
  renderWarnings();
  renderRiskOverview();
  renderTemplates();
  syncAutoChecklist();
  renderChecklist();
  renderReelList();
  saveState();
  history.updateUI();
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
  const newSegment = {
    id: crypto.randomUUID(),
    code: els.codeInput.value.trim(),
    duration: Number(els.durationInput.value),
    shift: els.shiftInput.value,
    damage: els.damageInput.value,
    note: els.noteInput.value.trim(),
    thumb
  };
  history.execute(new AddSegmentCommand(reel.id, newSegment, reel.segments.length));
  els.segmentForm.reset();
  els.durationInput.value = 12;
}

function moveSegment(id, direction) {
  const reel = getActiveReel();
  if (!reel) return;

  const fromIndex = reel.segments.findIndex((item) => item.id === id);
  if (fromIndex < 0) return;

  const visibleSegments = getFilteredSegments();
  const visibleIndex = visibleSegments.findIndex((item) => item.id === id);

  if (visibleIndex < 0) return;

  const targetVisibleIndex = visibleIndex + direction;
  if (targetVisibleIndex < 0 || targetVisibleIndex >= visibleSegments.length) return;

  const targetSegment = visibleSegments[targetVisibleIndex];
  const toIndex = reel.segments.findIndex((item) => item.id === targetSegment.id);

  if (toIndex < 0 || toIndex > reel.segments.length || toIndex === fromIndex) return;

  history.execute(new MoveSegmentCommand(reel.id, fromIndex, toIndex));
}

function exportList() {
  const reel = getActiveReel();
  if (!reel) return;
  const riskSummary = { "安全": 0, "低风险": 0, "中风险": 0, "高风险": 0 };
  const lines = [
    `胶片卷：${reel.title || "未命名胶片卷"}`,
    `总时长：${formatDuration(reel.segments.reduce((sum, item) => sum + Number(item.duration), 0))}`,
    ""
  ];
  reel.segments.forEach((item, index) => {
    const risk = calculateSegmentRisk(item);
    riskSummary[risk.label] = (riskSummary[risk.label] || 0) + 1;
    const riskStr = `[${risk.label} ${risk.score}分${risk.reasons.length > 0 ? "｜" + risk.reasons.join("；") : ""}]`;
    lines.push(`${index + 1}. ${item.code}｜${formatDuration(item.duration)}｜${item.shift}｜${item.damage}｜${riskStr}｜${item.note || "无备注"}`);
  });
  lines.push("");
  lines.push(`风险概览：安全 ${riskSummary["安全"]} · 低风险 ${riskSummary["低风险"]} · 中风险 ${riskSummary["中风险"]} · 高风险 ${riskSummary["高风险"]}`);
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

  const risk = calculateSegmentRisk(segment);
  const riskHtml = `
    <div class="drawer-risk-info ${risk.css}">
      <div class="drawer-risk-head">
        <span class="risk-badge ${risk.css}">${risk.label} ${risk.score}分</span>
      </div>
      ${risk.reasons.length > 0 ? `<div class="drawer-risk-reasons">${risk.reasons.map((r) => `<span class="risk-reason-tag">${escapeHtml(r)}</span>`).join("")}</div>` : ""}
    </div>
  `;

  const existingRiskInfo = els.drawerForm.querySelector(".drawer-risk-info");
  if (existingRiskInfo) existingRiskInfo.remove();

  els.drawerForm.insertAdjacentHTML("afterbegin", riskHtml);

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

  const oldData = structuredClone(reel.segments[segmentIndex]);

  const file = els.drawerThumbInput.files[0];
  if (file) {
    drawerThumbDataUrl = await readFileAsDataUrl(file);
  }

  const newData = {
    ...reel.segments[segmentIndex],
    code: els.drawerCode.value.trim(),
    duration: Number(els.drawerDuration.value),
    shift: els.drawerShift.value,
    damage: els.drawerDamage.value,
    note: els.drawerNote.value.trim(),
    thumb: drawerThumbDataUrl
  };

  history.execute(new EditSegmentCommand(reel.id, activeDrawerSegmentId, oldData, newData));
  closeDrawer();
}

function deleteFromDrawer() {
  const reel = getActiveReel();
  if (!reel || !activeDrawerSegmentId) return;
  if (!confirm("确定要删除此片段吗？可以使用撤销恢复。")) return;

  const segmentIndex = reel.segments.findIndex((s) => s.id === activeDrawerSegmentId);
  if (segmentIndex < 0) return;

  const segment = reel.segments[segmentIndex];
  history.execute(new DeleteSegmentCommand(reel.id, segment, segmentIndex));
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
    archived: false,
    segments: [],
    checklist: []
  };
  history.execute(new AddReelCommand(newReel));
  els.newReelNameInput.value = "";
}

function switchReel(reelId) {
  if (!state.reels.find((r) => r.id === reelId)) return;
  if (state.activeReelId === reelId) return;
  history.execute(new SwitchReelCommand(state.activeReelId, reelId));
}

function renameReel(reelId) {
  const reel = state.reels.find((r) => r.id === reelId);
  if (!reel) return;
  const oldTitle = reel.title;
  const newName = prompt("请输入新的胶片卷名称：", oldTitle);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) {
    alert("名称不能为空。");
    return;
  }
  if (trimmed === oldTitle) return;
  history.execute(new RenameReelCommand(reelId, oldTitle, trimmed));
}

function duplicateReel(reelId) {
  const reel = state.reels.find((r) => r.id === reelId);
  if (!reel) return;
  const copy = structuredClone(reel);
  copy.id = crypto.randomUUID();
  copy.title = `${reel.title} 副本`;
  copy.createdAt = Date.now();
  copy.archived = false;
  copy.segments = copy.segments.map((seg) => ({ ...seg, id: crypto.randomUUID() }));
  copy.checklist = copy.checklist.map((item) => ({ ...item, id: crypto.randomUUID() }));
  history.execute(new DuplicateReelCommand(reelId, copy));
}

function deleteReel(reelId) {
  const reel = state.reels.find((r) => r.id === reelId);
  if (!reel) return;
  if (!reel.archived && state.reels.filter((r) => !r.archived).length <= 1) {
    alert("至少需要保留一个活跃的胶片卷。");
    return;
  }
  if (!confirm(`确定要删除胶片卷「${reel.title}」吗？可使用撤销恢复。`)) return;

  const reelIndex = state.reels.findIndex((r) => r.id === reelId);
  const previousActiveId = state.activeReelId;
  history.execute(new DeleteReelCommand(reel, reelIndex, previousActiveId));
}

function archiveReel(reelId) {
  const reel = state.reels.find((r) => r.id === reelId);
  if (!reel || reel.archived) return;
  const activeCount = state.reels.filter((r) => !r.archived).length;
  if (activeCount <= 1) {
    alert("至少需要保留一个活跃的胶片卷。");
    return;
  }
  if (!confirm(`确定要归档胶片卷「${reel.title}」吗？归档后将不在默认列表中显示，可在归档标签页恢复。`)) return;

  const previousActiveId = state.activeReelId;
  history.execute(new ArchiveReelCommand(reelId, previousActiveId, true));
}

function restoreReel(reelId) {
  const reel = state.reels.find((r) => r.id === reelId);
  if (!reel || !reel.archived) return;

  const previousActiveId = state.activeReelId;
  history.execute(new ArchiveReelCommand(reelId, previousActiveId, false));
}

collectElements();

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
  const archiveBtn = event.target.closest("[data-archive-reel]");
  const restoreBtn = event.target.closest("[data-restore-reel]");
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
  } else if (archiveBtn) {
    event.stopPropagation();
    archiveReel(archiveBtn.dataset.archiveReel);
  } else if (restoreBtn) {
    event.stopPropagation();
    restoreReel(restoreBtn.dataset.restoreReel);
  } else if (deleteBtn) {
    event.stopPropagation();
    deleteReel(deleteBtn.dataset.deleteReel);
  } else if (card && card.dataset.reelId) {
    event.stopPropagation();
    const reel = state.reels.find((r) => r.id === card.dataset.reelId);
    if (reel && !reel.archived && card.dataset.reelId !== state.activeReelId) {
      switchReel(card.dataset.reelId);
    }
  }
});

if (els.reelTabBar) {
  els.reelTabBar.addEventListener("click", (event) => {
    const tab = event.target.closest(".reel-tab");
    if (!tab) return;
    const tabType = tab.dataset.reelTab;
    if (tabType && tabType !== reelListTab) {
      reelListTab = tabType;
      renderReelList();
    }
  });
}

els.reelTitle.addEventListener("input", () => {
  const reel = getActiveReel();
  if (reel) {
    reel.title = els.reelTitle.value;
    renderReelHeader();
    renderReelList();
    saveState();
  }
});

els.undoBtn.addEventListener("click", () => history.undo());
els.redoBtn.addEventListener("click", () => history.redo());

els.colorFilter.addEventListener("change", () => { renderList(); renderTimeline(); });
els.searchInput.addEventListener("input", () => { renderList(); renderTimeline(); });
els.segmentForm.addEventListener("submit", addSegment);
els.exportBtn.addEventListener("click", exportList);

els.segmentList.addEventListener("click", (event) => {
  const saveTpl = event.target.closest("[data-save-template]");
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-delete]");
  const view = event.target.closest("[data-view]");

  if (saveTpl) {
    event.stopPropagation();
    openSaveTemplateModal(saveTpl.dataset.saveTemplate);
    return;
  }
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
    if (!reel) return;

    const segmentId = remove.dataset.delete;
    const segmentIndex = reel.segments.findIndex((s) => s.id === segmentId);
    if (segmentIndex < 0) return;

    if (!confirm("确定要删除此片段吗？可以使用撤销恢复。")) return;

    const segment = reel.segments[segmentIndex];
    history.execute(new DeleteSegmentCommand(reel.id, segment, segmentIndex));
  }
  if (view && !up && !down && !remove && !saveTpl) {
    openDrawer(view.dataset.view);
  }
});

els.segmentList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  const reel = getActiveReel();
  if (!reel) return;

  draggedId = card.dataset.id;
  dragReelId = reel.id;
  dragStartIndex = reel.segments.findIndex((item) => item.id === draggedId);
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

els.segmentList.addEventListener("dragend", (event) => {
  event.target.closest("[data-id]")?.classList.remove("dragging");

  if (draggedId && dragReelId && dragStartIndex >= 0) {
    const reel = state.reels.find((r) => r.id === dragReelId);
    if (reel) {
      const currentIndex = reel.segments.findIndex((item) => item.id === draggedId);
      if (currentIndex >= 0 && currentIndex !== dragStartIndex) {
        const [item] = reel.segments.splice(currentIndex, 1);
        reel.segments.splice(dragStartIndex, 0, item);
        history.execute(new MoveSegmentCommand(dragReelId, dragStartIndex, currentIndex));
      }
    }
  }

  draggedId = null;
  dragStartIndex = -1;
  dragReelId = null;
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

els.timelineBar.addEventListener("click", (event) => {
  const block = event.target.closest("[data-timeline-id]");
  if (block) openDrawer(block.dataset.timelineId);
});

let timelineTooltipHideTimer = null;

function showTimelineTooltip(block, event) {
  if (timelineTooltipHideTimer) {
    clearTimeout(timelineTooltipHideTimer);
    timelineTooltipHideTimer = null;
  }

  const idx = block.dataset.segIndex;
  const code = block.dataset.segCode;
  const duration = block.dataset.segDuration;
  const risk = block.dataset.segRisk;
  const riskCss = block.dataset.segRiskCss;
  const note = block.dataset.segNote;
  const shift = block.dataset.segShift;
  const damage = block.dataset.segDamage;
  const isHidden = block.dataset.segHidden === "1";

  els.timelineTooltip.innerHTML = `
    <div class="tooltip-row">
      <span class="tooltip-label">序号</span>
      <span class="tooltip-value">#${idx} · ${escapeHtml(code)}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">时长</span>
      <span class="tooltip-value">${duration}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">风险</span>
      <span class="tooltip-value tooltip-risk ${riskCss}">${escapeHtml(risk)}</span>
    </div>
    <div class="tooltip-row">
      <span class="tooltip-label">状态</span>
      <span class="tooltip-value">${escapeHtml(shift)} · ${escapeHtml(damage)}</span>
    </div>
    <div class="tooltip-note-row">
      <span class="tooltip-label">备注</span>
      <span class="tooltip-value tooltip-note">${escapeHtml(note)}</span>
    </div>
    ${isHidden ? '<div class="tooltip-hint">当前筛选条件下已隐藏（淡化显示）</div>' : '<div class="tooltip-hint">点击查看并编辑详情</div>'}
  `;

  els.timelineTooltip.classList.add("visible");
  els.timelineTooltip.setAttribute("aria-hidden", "false");
  positionTimelineTooltip(block, event);
}

function positionTimelineTooltip(block, event) {
  const panelRect = els.timelineBar.closest(".timeline-panel").getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  const tooltipRect = els.timelineTooltip.getBoundingClientRect();

  let left = blockRect.left - panelRect.left + blockRect.width / 2 - tooltipRect.width / 2;
  let top = blockRect.top - panelRect.top - tooltipRect.height - 10;

  if (left < 4) left = 4;
  if (left + tooltipRect.width > panelRect.width - 4) {
    left = panelRect.width - tooltipRect.width - 4;
  }

  if (top < 4) {
    top = blockRect.bottom - panelRect.top + 10;
  }

  els.timelineTooltip.style.left = `${left}px`;
  els.timelineTooltip.style.top = `${top}px`;
}

function hideTimelineTooltip() {
  if (timelineTooltipHideTimer) clearTimeout(timelineTooltipHideTimer);
  timelineTooltipHideTimer = setTimeout(() => {
    els.timelineTooltip.classList.remove("visible");
    els.timelineTooltip.setAttribute("aria-hidden", "true");
  }, 80);
}

els.timelineBar.addEventListener("mouseover", (event) => {
  const block = event.target.closest("[data-timeline-id]");
  if (block) showTimelineTooltip(block, event);
});

els.timelineBar.addEventListener("mousemove", (event) => {
  const block = event.target.closest("[data-timeline-id]");
  if (block && els.timelineTooltip.classList.contains("visible")) {
    positionTimelineTooltip(block, event);
  }
});

els.timelineBar.addEventListener("mouseout", (event) => {
  const block = event.target.closest("[data-timeline-id]");
  const related = event.relatedTarget;
  if (block && (!related || !related.closest("[data-timeline-id]"))) {
    hideTimelineTooltip();
  }
});

els.timelineScroll.addEventListener("scroll", () => {
  if (els.timelineTooltip.classList.contains("visible")) {
    hideTimelineTooltip();
  }
}, true);

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
els.drawerSaveTemplate.addEventListener("click", () => {
  if (activeDrawerSegmentId) openSaveTemplateModal(activeDrawerSegmentId);
});

els.saveTplModalClose.addEventListener("click", closeSaveTemplateModal);
els.saveTplModalBackdrop.addEventListener("click", closeSaveTemplateModal);
els.saveTplCancelBtn.addEventListener("click", closeSaveTemplateModal);
els.saveTplForm.addEventListener("submit", saveTemplateFromSegment);

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
const importHeaderFields = ["片段编号", "秒数", "颜色偏移", "破损情况", "备注"];

function openImportModal() {
  els.importModal.classList.add("open");
  els.importModalBackdrop.classList.add("open");
  els.importModal.setAttribute("aria-hidden", "false");
  els.importCsvText.value = "";
  els.importCsvFile.value = "";
  els.importErrors.style.display = "none";
  els.importPreviewWrap.style.display = "none";
  els.importConfirmBtn.disabled = true;
  els.importConfirmBtn.textContent = "确认导入有效行";
  els.importSelectAll.checked = false;
  els.importSelectAll.indeterminate = false;
  els.importSelectAll.disabled = true;
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
    const normalizedFields = fields.map((field) => field.trim().toLowerCase());
    const isHeaderRow = importHeaderFields.every((field, index) => normalizedFields[index] === field.toLowerCase());
    if (isHeaderRow) continue;
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
        statusText: row.parseError,
        selected: false,
        selectable: false
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
    if (!/^\d+$/.test(trimmedDuration) || durationNum <= 0 || !Number.isFinite(durationNum)) {
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
      statusText: errors.join("；"),
      selected: errors.length === 0,
      selectable: errors.length === 0
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
      row.selected = false;
      row.selectable = true;
    } else if (existingCodes.includes(row.code)) {
      row.status = "dup";
      row.statusText = "与当前清单编号重复";
      row.selected = false;
      row.selectable = true;
    }
  }

  return { validated, duplicateCodes };
}

function renderImportPreview(validated) {
  const okCount = validated.filter((r) => r.status === "ok").length;
  const dupCount = validated.filter((r) => r.status === "dup").length;
  const errCount = validated.filter((r) => r.status === "error").length;
  const selectedCount = validated.filter((r) => r.selected).length;
  const skippedCount = validated.filter((r) => !r.selected && r.selectable).length;

  const reel = getActiveReel();
  const reelSegmentCount = reel ? reel.segments.length : 0;
  const appendPosition = reelSegmentCount + 1;

  els.importPreviewStats.innerHTML = `
    <span style="margin-right:16px">有效 ${okCount} · 重复 ${dupCount} · 错误 ${errCount}</span>
    <span style="margin-right:16px;color:var(--green);font-weight:900">✓ 选中 ${selectedCount}</span>
    <span style="margin-right:16px;color:var(--muted)">跳过 ${skippedCount + errCount}</span>
    <span>将追加到第 ${appendPosition} 条${selectedCount > 1 ? `–${appendPosition + selectedCount - 1} 条` : ""}</span>
  `;

  const selectableRows = validated.filter((r) => r.selectable);
  const allSelectableSelected = selectableRows.length > 0 && selectableRows.every((r) => r.selected);
  els.importSelectAll.checked = allSelectableSelected;
  els.importSelectAll.indeterminate = selectedCount > 0 && !allSelectableSelected;
  els.importSelectAll.disabled = selectableRows.length === 0;

  els.importConfirmBtn.disabled = selectedCount === 0;
  els.importConfirmBtn.textContent = selectedCount > 0 ? `确认导入 ${selectedCount} 条` : "确认导入有效行";

  els.importPreviewBody.innerHTML = validated
    .map((row, idx) => {
      const rowClass = row.status === "error" ? "row-error" : row.status === "dup" ? "row-dup" : "row-ok";
      const selectedClass = row.selected && row.selectable ? "row-selected" : "";
      const statusClass = row.status === "error" ? "import-status-err" : row.status === "dup" ? "import-status-warn" : "import-status-ok";
      const statusLabel = row.status === "ok" ? "✓ 有效" : row.status === "dup" ? "⚠ 重复" : "✗ 错误";
      const checkboxDisabled = !row.selectable ? "disabled" : "";
      const checkboxChecked = row.selected ? "checked" : "";
      const dupHint = row.status === "dup" && row.selected ? `<br/><span style="font-weight:400;font-size:11px;color:var(--green)">导入时将自动分配新编号</span>` : "";
      return `
        <tr class="${rowClass} ${selectedClass}">
          <td><input type="checkbox" class="import-row-check" data-idx="${idx}" ${checkboxChecked} ${checkboxDisabled} /></td>
          <td>${row.lineNum}</td>
          <td>${escapeHtml(row.code)}</td>
          <td>${escapeHtml(row.duration)}</td>
          <td>${escapeHtml(row.shift)}</td>
          <td>${escapeHtml(row.damage)}</td>
          <td>${escapeHtml(row.note)}</td>
          <td class="${statusClass}">${statusLabel}${row.statusText && row.status !== "ok" ? `<br/><span style="font-weight:400;font-size:11px">${escapeHtml(row.statusText)}</span>` : ""}${dupHint}</td>
        </tr>
      `;
    })
    .join("");

  els.importPreviewBody.querySelectorAll(".import-row-check").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.idx);
      if (idx >= 0 && idx < importParsedRows.length) {
        importParsedRows[idx].selected = e.target.checked;
        renderImportPreview(importParsedRows);
      }
    });
  });

  els.importPreviewWrap.style.display = "flex";

  const errorItems = [];
  if (errCount > 0) errorItems.push(`${errCount} 行存在解析或数据错误，无法勾选`);
  const dupNotSelected = validated.filter((r) => r.status === "dup" && !r.selected).length;
  if (dupNotSelected > 0) errorItems.push(`${dupNotSelected} 行编号重复，默认未选中，可手动勾选后用新编号导入`);
  const dupSelected = validated.filter((r) => r.status === "dup" && r.selected).length;
  if (dupSelected > 0) errorItems.push(`${dupSelected} 行重复编号已勾选，导入时将自动分配新编号`);

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

function generateUniqueCode(baseCode, existingCodesSet, selectedCodes, selfIdx) {
  if (!existingCodesSet.has(baseCode) && !selectedCodes.some((c, i) => c === baseCode && i !== selfIdx)) {
    return baseCode;
  }
  let suffix = 2;
  while (true) {
    const candidate = `${baseCode}-${suffix}`;
    if (!existingCodesSet.has(candidate) && !selectedCodes.includes(candidate)) {
      return candidate;
    }
    suffix++;
  }
}

function handleImportConfirm() {
  const reel = getActiveReel();
  if (!reel) return;

  const selectedRows = importParsedRows.filter((r) => r.selected && r.selectable);
  if (selectedRows.length === 0) return;

  if (!confirm(`确认将 ${selectedRows.length} 条选中片段导入当前放映清单「${reel.title}」？${selectedRows.some(r => r.status === "dup") ? "重复行将自动分配新编号。" : ""}可使用撤销恢复。`)) return;

  const existingCodesSet = new Set(reel.segments.map((s) => s.code));
  const newCodes = [];
  const newSegments = selectedRows.map((row, idx) => {
    let finalCode = row.code;
    if (row.status === "dup") {
      finalCode = generateUniqueCode(row.code, existingCodesSet, newCodes, idx);
    }
    newCodes.push(finalCode);
    return {
      id: crypto.randomUUID(),
      code: finalCode,
      duration: row._durationNum,
      shift: row.shift,
      damage: row.damage,
      note: row.note,
      thumb: ""
    };
  });

  history.execute(new BatchImportCommand(reel.id, newSegments, reel.segments.length));
  closeImportModal();
}

els.importBtn.addEventListener("click", openImportModal);
els.importModalClose.addEventListener("click", closeImportModal);
els.importModalBackdrop.addEventListener("click", closeImportModal);
els.importCancelBtn.addEventListener("click", closeImportModal);
els.importParseBtn.addEventListener("click", handleImportParse);
els.importConfirmBtn.addEventListener("click", handleImportConfirm);

els.importSelectAll.addEventListener("change", (e) => {
  const checked = e.target.checked;
  for (const row of importParsedRows) {
    if (row.selectable) {
      row.selected = checked;
    }
  }
  if (importParsedRows.length > 0) {
    renderImportPreview(importParsedRows);
  }
});

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
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

  if (ctrlKey && event.key === "z" && !event.shiftKey) {
    event.preventDefault();
    history.undo();
    return;
  }

  if (ctrlKey && event.shiftKey && event.key === "z") {
    event.preventDefault();
    history.redo();
    return;
  }

  if (ctrlKey && event.key === "y") {
    event.preventDefault();
    history.redo();
    return;
  }

  if (event.key === "Escape") {
    if (els.backupModal.classList.contains("open")) {
      closeBackupModal();
    } else if (els.importModal.classList.contains("open")) {
      closeImportModal();
    } else if (activeDrawerSegmentId) {
      closeDrawer();
    } else if (els.reelModal.classList.contains("open")) {
      closeReelModal();
    }
  }
});

const BACKUP_VERSION = 3;
const REQUIRED_REEL_FIELDS = ["id", "title", "createdAt", "segments", "checklist"];
const REQUIRED_SEGMENT_FIELDS = ["id", "code", "duration", "shift", "damage", "note", "thumb"];
const REQUIRED_TEMPLATE_FIELDS = ["id", "name", "duration", "shift", "damage", "notePrefix"];
const REQUIRED_CHECKLIST_FIELDS = ["id", "text", "source", "segmentId", "completed"];

let backupParsedData = null;
let backupConflictReport = null;

function openBackupModal() {
  els.backupModal.classList.add("open");
  els.backupModalBackdrop.classList.add("open");
  els.backupModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  updateBackupExportInfo();
  resetBackupImportState();
}

function closeBackupModal() {
  els.backupModal.classList.remove("open");
  els.backupModalBackdrop.classList.remove("open");
  els.backupModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  backupParsedData = null;
  backupConflictReport = null;
}

function resetBackupImportState() {
  els.backupFileInput.value = "";
  els.backupErrors.style.display = "none";
  els.backupWarnings.style.display = "none";
  els.backupPreviewWrap.style.display = "none";
  els.backupConflictInfo.style.display = "none";
  els.backupConfirmBtn.disabled = true;
  backupParsedData = null;
  backupConflictReport = null;
  const radios = document.querySelectorAll('input[name="backupMode"]');
  radios.forEach((r) => {
    if (r.value === "overwrite") r.checked = true;
  });
}

function updateBackupExportInfo() {
  const totalSegments = state.reels.reduce((sum, r) => sum + r.segments.length, 0);
  const activeReels = state.reels.filter((r) => !r.archived).length;
  const archivedReels = state.reels.filter((r) => r.archived).length;
  els.backupReelCount.textContent = `${state.reels.length} 卷（活跃 ${activeReels} / 归档 ${archivedReels}）`;
  els.backupSegmentCount.textContent = `${totalSegments} 个`;
  els.backupTemplateCount.textContent = `${state.templates.length} 个`;
}

function exportBackup() {
  const backupData = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    activeReelId: state.activeReelId,
    reels: structuredClone(state.reels),
    templates: structuredClone(state.templates),
    riskRules: getSerializedRulesForBackup()
  };

  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  link.download = `film-reel-backup-${dateStr}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function validateBackupStructure(data) {
  const errors = [];

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    errors.push("备份文件内容不是有效的 JSON 对象");
    return { valid: false, errors };
  }

  if (data.version === undefined) {
    errors.push("缺少 version 字段，无法识别备份版本");
  } else if (typeof data.version !== "number") {
    errors.push("version 字段必须是数字类型");
  } else if (data.version < 2 || data.version > BACKUP_VERSION) {
    errors.push(`备份版本不兼容：当前应用版本 v${BACKUP_VERSION}，备份文件版本 v${data.version}`);
  }

  if (data.exportedAt !== undefined && typeof data.exportedAt !== "number") {
    errors.push("exportedAt 字段必须是数字类型（时间戳）");
  }

  if (!Array.isArray(data.reels)) {
    errors.push("缺少 reels 数组或格式不正确（必须是数组类型）");
  } else {
    data.reels.forEach((reel, reelIdx) => {
      if (!reel || typeof reel !== "object" || Array.isArray(reel)) {
        errors.push(`胶片卷[${reelIdx}]不是有效的对象`);
        return;
      }

      const missingReelFields = REQUIRED_REEL_FIELDS.filter((f) => !(f in reel));
      if (missingReelFields.length > 0) {
        errors.push(`胶片卷[${reelIdx}]缺少字段：${missingReelFields.join("、")}`);
      }

      if (!Array.isArray(reel.segments)) {
        errors.push(`胶片卷[${reelIdx}]的 segments 字段不是数组类型`);
      } else {
        reel.segments.forEach((seg, segIdx) => {
          if (!seg || typeof seg !== "object" || Array.isArray(seg)) {
            errors.push(`胶片卷[${reelIdx}]片段[${segIdx}]不是有效的对象`);
            return;
          }
          const missingSegFields = REQUIRED_SEGMENT_FIELDS.filter((f) => !(f in seg));
          if (missingSegFields.length > 0) {
            errors.push(`胶片卷[${reelIdx}]片段[${segIdx}]缺少字段：${missingSegFields.join("、")}`);
          }
          if (typeof seg.id !== "string" || seg.id.trim() === "") {
            errors.push(`胶片卷[${reelIdx}]片段[${segIdx}]的 id 字段必须是非空字符串`);
          }
        });
      }

      if (!Array.isArray(reel.checklist)) {
        errors.push(`胶片卷[${reelIdx}]的 checklist 字段不是数组类型`);
      } else {
        reel.checklist.forEach((item, itemIdx) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            errors.push(`胶片卷[${reelIdx}]检查项[${itemIdx}]不是有效的对象`);
            return;
          }
          const missingItemFields = REQUIRED_CHECKLIST_FIELDS.filter((f) => !(f in item));
          if (missingItemFields.length > 0) {
            errors.push(`胶片卷[${reelIdx}]检查项[${itemIdx}]缺少字段：${missingItemFields.join("、")}`);
          }
          if (typeof item.id !== "string" || item.id.trim() === "") {
            errors.push(`胶片卷[${reelIdx}]检查项[${itemIdx}]的 id 字段必须是非空字符串`);
          }
        });
      }

      if (typeof reel.id !== "string" || reel.id.trim() === "") {
        errors.push(`胶片卷[${reelIdx}]的 id 字段必须是非空字符串`);
      }
    });
  }

  if (!Array.isArray(data.templates)) {
    errors.push("缺少 templates 数组或格式不正确（必须是数组类型）");
  } else {
    data.templates.forEach((tpl, tplIdx) => {
      if (!tpl || typeof tpl !== "object" || Array.isArray(tpl)) {
        errors.push(`模板[${tplIdx}]不是有效的对象`);
        return;
      }
      const missingTplFields = REQUIRED_TEMPLATE_FIELDS.filter((f) => !(f in tpl));
      if (missingTplFields.length > 0) {
        errors.push(`模板[${tplIdx}]缺少字段：${missingTplFields.join("、")}`);
      }
      if (typeof tpl.id !== "string" || tpl.id.trim() === "") {
        errors.push(`模板[${tplIdx}]的 id 字段必须是非空字符串`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

function migrateBackupData(data) {
  if (!data || data.version === BACKUP_VERSION) return data;

  const migrated = structuredClone(data);

  if (migrated.version === 2) {
    if (Array.isArray(migrated.reels)) {
      migrated.reels.forEach((reel) => {
        if (reel.archived === undefined) {
          reel.archived = false;
        }
      });
    }
    migrated.version = 3;
  }

  return migrated;
}

function detectIdConflicts(backupData) {
  const currentReelIds = new Set(state.reels.map((r) => r.id));
  const currentSegmentIds = new Set();
  const currentTemplateIds = new Set(state.templates.map((t) => t.id));
  const currentChecklistIds = new Set();

  state.reels.forEach((r) => {
    r.segments.forEach((s) => currentSegmentIds.add(s.id));
    r.checklist.forEach((c) => currentChecklistIds.add(c.id));
  });

  const backupReelIds = new Set();
  const backupSegmentIds = new Set();
  const backupTemplateIds = new Set();
  const backupChecklistIds = new Set();

  backupData.reels.forEach((r) => {
    backupReelIds.add(r.id);
    r.segments.forEach((s) => backupSegmentIds.add(s.id));
    r.checklist.forEach((c) => backupChecklistIds.add(c.id));
  });
  backupData.templates.forEach((t) => backupTemplateIds.add(t.id));

  const reelConflicts = [...backupReelIds].filter((id) => currentReelIds.has(id));
  const segmentConflicts = [...backupSegmentIds].filter((id) => currentSegmentIds.has(id));
  const templateConflicts = [...backupTemplateIds].filter((id) => currentTemplateIds.has(id));
  const checklistConflicts = [...backupChecklistIds].filter((id) => currentChecklistIds.has(id));

  return {
    hasConflicts: reelConflicts.length > 0 || segmentConflicts.length > 0 || templateConflicts.length > 0 || checklistConflicts.length > 0,
    reelConflicts: reelConflicts.length,
    segmentConflicts: segmentConflicts.length,
    templateConflicts: templateConflicts.length,
    checklistConflicts: checklistConflicts.length,
    totalConflicts: reelConflicts.length + segmentConflicts.length + templateConflicts.length + checklistConflicts.length
  };
}

function detectInternalDuplicateIds(backupData) {
  function findDuplicates(ids) {
    const seen = new Set();
    const duplicates = new Set();
    for (const id of ids) {
      if (seen.has(id)) {
        duplicates.add(id);
      } else {
        seen.add(id);
      }
    }
    return [...duplicates];
  }

  const reelIds = [];
  const segmentIds = [];
  const templateIds = [];
  const checklistIds = [];

  backupData.reels.forEach((r) => {
    reelIds.push(r.id);
    r.segments.forEach((s) => segmentIds.push(s.id));
    r.checklist.forEach((c) => checklistIds.push(c.id));
  });
  backupData.templates.forEach((t) => templateIds.push(t.id));

  const duplicateReelIds = findDuplicates(reelIds);
  const duplicateSegmentIds = findDuplicates(segmentIds);
  const duplicateTemplateIds = findDuplicates(templateIds);
  const duplicateChecklistIds = findDuplicates(checklistIds);

  return {
    hasDuplicates: duplicateReelIds.length > 0 || duplicateSegmentIds.length > 0 || duplicateTemplateIds.length > 0 || duplicateChecklistIds.length > 0,
    reelDuplicates: duplicateReelIds.length,
    segmentDuplicates: duplicateSegmentIds.length,
    templateDuplicates: duplicateTemplateIds.length,
    checklistDuplicates: duplicateChecklistIds.length,
    totalDuplicates: duplicateReelIds.length + duplicateSegmentIds.length + duplicateTemplateIds.length + duplicateChecklistIds.length
  };
}

function handleBackupFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  els.backupWarnings.style.display = "none";

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      validateAndPreviewBackup(data);
    } catch (e) {
      showBackupErrors(["文件解析失败：不是有效的 JSON 文件"]);
      els.backupPreviewWrap.style.display = "none";
      els.backupConfirmBtn.disabled = true;
    }
  };
  reader.onerror = () => {
    showBackupErrors(["文件读取失败，请重试"]);
    els.backupPreviewWrap.style.display = "none";
    els.backupConfirmBtn.disabled = true;
  };
  reader.readAsText(file, "UTF-8");
}

function validateAndPreviewBackup(data) {
  const migratedData = migrateBackupData(data);

  const validation = validateBackupStructure(migratedData);

  if (!validation.valid) {
    showBackupErrors(validation.errors);
    els.backupPreviewWrap.style.display = "none";
    els.backupConfirmBtn.disabled = true;
    backupParsedData = null;
    return;
  }

  els.backupErrors.style.display = "none";

  if (data.version !== BACKUP_VERSION) {
    const warnMsgs = [`检测到旧版备份文件（v${data.version}），已自动升级为 v${BACKUP_VERSION}，所有胶片卷默认设为未归档状态。`];
    showBackupWarnings(warnMsgs);
  }

  const internalDupReport = detectInternalDuplicateIds(migratedData);
  if (internalDupReport.hasDuplicates) {
    const dupWarnings = ["备份文件内部存在重复 ID，数据可能已损坏："];
    const parts = [];
    if (internalDupReport.reelDuplicates > 0) parts.push(`${internalDupReport.reelDuplicates} 个胶片卷 ID`);
    if (internalDupReport.segmentDuplicates > 0) parts.push(`${internalDupReport.segmentDuplicates} 个片段 ID`);
    if (internalDupReport.templateDuplicates > 0) parts.push(`${internalDupReport.templateDuplicates} 个模板 ID`);
    if (internalDupReport.checklistDuplicates > 0) parts.push(`${internalDupReport.checklistDuplicates} 个检查项 ID`);
    dupWarnings.push(`共 ${internalDupReport.totalDuplicates} 个重复 ID（${parts.join("、")}）。`);
    dupWarnings.push("恢复时将自动为重复 ID 生成新的唯一标识，避免数据冲突。");
    showBackupWarnings(dupWarnings);
  } else if (data.version === BACKUP_VERSION) {
    els.backupWarnings.style.display = "none";
  }

  const totalSegments = migratedData.reels.reduce((sum, r) => sum + (r.segments?.length || 0), 0);
  const activeReels = migratedData.reels.filter((r) => !r.archived).length;
  const archivedReels = migratedData.reels.filter((r) => r.archived).length;
  const exportDate = migratedData.exportedAt ? new Date(migratedData.exportedAt) : null;
  const exportTimeStr = exportDate
    ? `${exportDate.getFullYear()}/${String(exportDate.getMonth() + 1).padStart(2, "0")}/${String(exportDate.getDate()).padStart(2, "0")} ${String(exportDate.getHours()).padStart(2, "0")}:${String(exportDate.getMinutes()).padStart(2, "0")}`
    : "未知";

  els.backupVersionBadge.textContent = `v${migratedData.version}`;
  els.previewReelCount.textContent = `${migratedData.reels.length} 卷（活跃 ${activeReels} / 归档 ${archivedReels}）`;
  els.previewSegmentCount.textContent = `${totalSegments} 个`;
  els.previewTemplateCount.textContent = `${migratedData.templates.length} 个`;
  els.previewExportTime.textContent = exportTimeStr;

  backupConflictReport = detectIdConflicts(migratedData);
  if (backupConflictReport.hasConflicts) {
    els.backupConflictInfo.style.display = "block";
    const parts = [];
    if (backupConflictReport.reelConflicts > 0) parts.push(`${backupConflictReport.reelConflicts} 个胶片卷 ID`);
    if (backupConflictReport.segmentConflicts > 0) parts.push(`${backupConflictReport.segmentConflicts} 个片段 ID`);
    if (backupConflictReport.templateConflicts > 0) parts.push(`${backupConflictReport.templateConflicts} 个模板 ID`);
    if (backupConflictReport.checklistConflicts > 0) parts.push(`${backupConflictReport.checklistConflicts} 个检查项 ID`);
    els.backupConflictText.textContent = `检测到 ${backupConflictReport.totalConflicts} 个 ID 冲突（${parts.join("、")}）。合并模式下将自动生成新 ID。`;
  } else {
    els.backupConflictInfo.style.display = "none";
  }

  backupParsedData = migratedData;
  els.backupPreviewWrap.style.display = "flex";
  els.backupConfirmBtn.disabled = false;
}

function showBackupErrors(errors) {
  els.backupErrors.innerHTML = `<h4>⚠ 备份校验失败</h4><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`;
  els.backupErrors.style.display = "block";
  els.backupWarnings.style.display = "none";
}

function showBackupWarnings(warnings) {
  els.backupWarnings.innerHTML = `<h4>⚠ 备份数据存在问题</h4><ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`;
  els.backupWarnings.style.display = "block";
}

function generateUniqueId(usedSet) {
  let newId;
  do {
    newId = crypto.randomUUID();
  } while (usedSet.has(newId));
  usedSet.add(newId);
  return newId;
}

function resolveImportedId(oldId, usedSet, firstOccurrenceMap) {
  if (!usedSet.has(oldId)) {
    usedSet.add(oldId);
    if (firstOccurrenceMap && !(oldId in firstOccurrenceMap)) {
      firstOccurrenceMap[oldId] = oldId;
    }
    return oldId;
  }

  const newId = generateUniqueId(usedSet);
  if (firstOccurrenceMap && !(oldId in firstOccurrenceMap)) {
    firstOccurrenceMap[oldId] = newId;
  }
  return newId;
}

function normalizeImportedBackupData(backupData, usedIds = {}) {
  const usedReelIds = usedIds.reels || new Set();
  const usedSegmentIds = usedIds.segments || new Set();
  const usedTemplateIds = usedIds.templates || new Set();
  const usedChecklistIds = usedIds.checklist || new Set();
  const segmentIdFirstOccurrenceMap = {};

  const normalizedReels = backupData.reels.map((reel) => {
    const reelCopy = structuredClone(reel);
    reelCopy.id = resolveImportedId(reelCopy.id, usedReelIds);

    reelCopy.segments = reelCopy.segments.map((seg) => {
      const newSegId = resolveImportedId(seg.id, usedSegmentIds, segmentIdFirstOccurrenceMap);
      return { ...seg, id: newSegId };
    });

    reelCopy.checklist = reelCopy.checklist.map((item) => {
      const newItemId = resolveImportedId(item.id, usedChecklistIds);
      const newSegId = item.segmentId ? (segmentIdFirstOccurrenceMap[item.segmentId] || item.segmentId) : null;
      return { priority: "normal", ...item, id: newItemId, segmentId: newSegId };
    });

    return reelCopy;
  });

  const normalizedTemplates = backupData.templates.map((tpl) => {
    const tplCopy = structuredClone(tpl);
    tplCopy.id = resolveImportedId(tplCopy.id, usedTemplateIds);
    return tplCopy;
  });

  return {
    reels: normalizedReels,
    templates: normalizedTemplates
  };
}

function applyBackupOverwrite(backupData) {
  try {
    const normalizedData = normalizeImportedBackupData(backupData);
    const newState = {
      version: BACKUP_VERSION,
      activeReelId: backupData.activeReelId,
      reels: normalizedData.reels,
      templates: normalizedData.templates
    };

    const activeReel = newState.reels.find((r) => r.id === newState.activeReelId && !r.archived);
    if (!activeReel) {
      const firstActive = newState.reels.find((r) => !r.archived);
      if (firstActive) {
        newState.activeReelId = firstActive.id;
      }
    }

    state = newState;
    saveState();
    renderAll();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function applyBackupMerge(backupData) {
  try {
    const usedReelIds = new Set(state.reels.map((r) => r.id));
    const usedSegmentIds = new Set();
    const usedTemplateIds = new Set(state.templates.map((t) => t.id));
    const usedChecklistIds = new Set();

    state.reels.forEach((r) => {
      r.segments.forEach((s) => usedSegmentIds.add(s.id));
      r.checklist.forEach((c) => usedChecklistIds.add(c.id));
    });

    const normalizedData = normalizeImportedBackupData(backupData, {
      reels: usedReelIds,
      segments: usedSegmentIds,
      templates: usedTemplateIds,
      checklist: usedChecklistIds
    });

    const mergedReels = [...state.reels];
    normalizedData.reels.forEach((reelCopy, index) => {
      if (reelCopy.id !== backupData.reels[index].id) {
        reelCopy.title = `${reelCopy.title}（导入）`;
      }

      mergedReels.push(reelCopy);
    });

    const mergedTemplates = [...state.templates];
    normalizedData.templates.forEach((tplCopy, index) => {
      if (tplCopy.id !== backupData.templates[index].id) {
        tplCopy.name = `${tplCopy.name}（导入）`;
      }
      mergedTemplates.push(tplCopy);
    });

    state.reels = mergedReels;
    state.templates = mergedTemplates;
    saveState();
    renderAll();

    return { success: true, mergedCount: backupData.reels.length + backupData.templates.length, hasRiskRules: !!backupData.riskRules };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function confirmBackupRestore() {
  if (!backupParsedData) return;

  const mode = document.querySelector('input[name="backupMode"]:checked')?.value || "overwrite";
  const reelCount = backupParsedData.reels.length;
  const segmentCount = backupParsedData.reels.reduce((sum, r) => sum + r.segments.length, 0);

  let confirmMsg;
  if (mode === "overwrite") {
    confirmMsg = `确认用备份数据覆盖当前所有内容？\n\n将恢复：${reelCount} 个胶片卷、${segmentCount} 个片段、${backupParsedData.templates.length} 个模板\n\n此操作将清除当前所有数据，不可撤销。`;
  } else {
    confirmMsg = `确认将备份数据合并到当前清单？\n\n将追加：${reelCount} 个胶片卷、${segmentCount} 个片段、${backupParsedData.templates.length} 个模板\n\nID 冲突时会自动生成新 ID。`;
  }

  if (!confirm(confirmMsg)) return;

  const snapshot = structuredClone(state);

  let result;
  if (mode === "overwrite") {
    result = applyBackupOverwrite(backupParsedData);
  } else {
    result = applyBackupMerge(backupParsedData);
  }

  if (!result.success) {
    state = snapshot;
    saveState();
    renderAll();
    alert(`恢复失败，已回滚到原有数据：${result.error}`);
    return;
  }

  let riskRulesRestored = false;
  if (mode === "overwrite" && backupParsedData.riskRules) {
    const restoreResult = restoreRulesFromBackup(backupParsedData.riskRules);
    riskRulesRestored = restoreResult.success;
  } else if (mode === "merge" && backupParsedData.riskRules) {
    if (confirm("备份文件中包含风险评分规则，是否同时导入这些规则？\n\n选择「确定」将用备份中的规则覆盖当前规则；选择「取消」将保留当前规则。")) {
      const restoreResult = restoreRulesFromBackup(backupParsedData.riskRules);
      riskRulesRestored = restoreResult.success;
    }
  }

  if (riskRulesRestored) {
    syncAutoChecklist();
    renderAll();
  }

  history.clear();
  let successMsg = mode === "overwrite" ? "数据恢复成功！" : `合并成功！已追加 ${result.mergedCount} 项数据。`;
  if (riskRulesRestored) {
    successMsg += "\n风险评分规则已同步恢复。";
  }
  alert(successMsg);
  closeBackupModal();
}

els.backupBtn.addEventListener("click", openBackupModal);
els.backupModalClose.addEventListener("click", closeBackupModal);
els.backupModalBackdrop.addEventListener("click", closeBackupModal);
els.backupCancelBtn.addEventListener("click", closeBackupModal);
els.backupExportBtn.addEventListener("click", exportBackup);
els.backupFileInput.addEventListener("change", handleBackupFileSelect);
els.backupConfirmBtn.addEventListener("click", confirmBackupRestore);

function openRiskRulesModal() {
  els.riskRulesModal.classList.add("open");
  els.riskRulesModalBackdrop.classList.add("open");
  els.riskRulesModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  renderRiskRulesForm();
}

function closeRiskRulesModal() {
  els.riskRulesModal.classList.remove("open");
  els.riskRulesModalBackdrop.classList.remove("open");
  els.riskRulesModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  els.riskRulesErrors.style.display = "none";
}

function renderRiskRulesForm() {
  const rules = getCurrentRiskRules();

  els.shiftRulesGrid.innerHTML = Object.entries(rules.shift)
    .map(([key, value]) => `
      <div class="rules-row">
        <span class="rules-row-label">${escapeHtml(key)}</span>
        <span class="rules-row-input">
          <input type="number" min="0" step="1" data-rule-type="shift" data-rule-key="${escapeHtml(key)}" value="${value}" />
        </span>
      </div>
    `).join("");

  els.damageRulesGrid.innerHTML = Object.entries(rules.damage)
    .map(([key, value]) => `
      <div class="rules-row">
        <span class="rules-row-label">${escapeHtml(key)}</span>
        <span class="rules-row-input">
          <input type="number" min="0" step="1" data-rule-type="damage" data-rule-key="${escapeHtml(key)}" value="${value}" />
        </span>
      </div>
    `).join("");

  els.durationRulesList.innerHTML = rules.duration.thresholds
    .map((t, i) => `
      <div class="duration-rule-item">
        <label class="duration-rule-label">
          <span>最大秒数</span>
          <input type="number" min="1" step="1" data-rule-type="duration" data-rule-index="${i}" data-rule-field="max" value="${t.max}" />
        </label>
        <label class="duration-rule-label">
          <span>分值</span>
          <input type="number" min="0" step="1" data-rule-type="duration" data-rule-index="${i}" data-rule-field="score" value="${t.score}" />
        </label>
        <label class="duration-rule-label">
          <span>原因描述</span>
          <input type="text" data-rule-type="duration" data-rule-index="${i}" data-rule-field="reason" value="${escapeHtml(t.reason)}" />
        </label>
      </div>
    `).join("");

  els.keywordsRulesList.innerHTML = rules.noteKeywords
    .map((kw, i) => `
      <div class="keyword-rule-item">
        <label class="keyword-rule-label">
          <span>正则表达式</span>
          <input type="text" data-rule-type="keyword" data-rule-index="${i}" data-rule-field="pattern" value="${escapeHtml(kw.pattern)}" />
        </label>
        <label class="keyword-rule-label">
          <span>分值</span>
          <input type="number" min="0" step="1" data-rule-type="keyword" data-rule-index="${i}" data-rule-field="score" value="${kw.score}" />
        </label>
        <label class="keyword-rule-label">
          <span>原因描述</span>
          <input type="text" data-rule-type="keyword" data-rule-index="${i}" data-rule-field="reason" value="${escapeHtml(kw.reason)}" />
        </label>
      </div>
    `).join("");

  els.levelsRulesList.innerHTML = rules.levels
    .map((l, i) => `
      <div class="level-rule-item">
        <label class="level-rule-label">
          <span>最大分值</span>
          <input type="text" data-rule-type="level" data-rule-index="${i}" data-rule-field="max" value="${escapeHtml(String(l.max))}" />
        </label>
        <label class="level-rule-label">
          <span>等级标签</span>
          <input type="text" data-rule-type="level" data-rule-index="${i}" data-rule-field="label" value="${escapeHtml(l.label)}" />
        </label>
        <label class="level-rule-label">
          <span>样式类</span>
          <select data-rule-type="level" data-rule-index="${i}" data-rule-field="css">
            <option value="risk-safe" ${l.css === "risk-safe" ? "selected" : ""}>安全（绿色）</option>
            <option value="risk-low" ${l.css === "risk-low" ? "selected" : ""}>低风险（蓝色）</option>
            <option value="risk-medium" ${l.css === "risk-medium" ? "selected" : ""}>中风险（黄色）</option>
            <option value="risk-high" ${l.css === "risk-high" ? "selected" : ""}>高风险（红色）</option>
          </select>
        </label>
      </div>
    `).join("");
}

function collectRiskRulesFromForm() {
  const rules = {
    shift: {},
    damage: {},
    duration: { thresholds: [] },
    noteKeywords: [],
    levels: []
  };

  els.shiftRulesGrid.querySelectorAll("input").forEach(input => {
    const key = input.dataset.ruleKey;
    rules.shift[key] = Number(input.value) || 0;
  });

  els.damageRulesGrid.querySelectorAll("input").forEach(input => {
    const key = input.dataset.ruleKey;
    rules.damage[key] = Number(input.value) || 0;
  });

  const durationItems = els.durationRulesList.querySelectorAll(".duration-rule-item");
  durationItems.forEach((item, i) => {
    const maxInput = item.querySelector('[data-rule-field="max"]');
    const scoreInput = item.querySelector('[data-rule-field="score"]');
    const reasonInput = item.querySelector('[data-rule-field="reason"]');
    rules.duration.thresholds.push({
      max: Number(maxInput.value) || 0,
      score: Number(scoreInput.value) || 0,
      reason: reasonInput.value || ""
    });
  });

  const keywordItems = els.keywordsRulesList.querySelectorAll(".keyword-rule-item");
  keywordItems.forEach((item, i) => {
    const patternInput = item.querySelector('[data-rule-field="pattern"]');
    const scoreInput = item.querySelector('[data-rule-field="score"]');
    const reasonInput = item.querySelector('[data-rule-field="reason"]');
    rules.noteKeywords.push({
      pattern: patternInput.value || "",
      score: Number(scoreInput.value) || 0,
      reason: reasonInput.value || ""
    });
  });

  const levelItems = els.levelsRulesList.querySelectorAll(".level-rule-item");
  levelItems.forEach((item, i) => {
    const maxInput = item.querySelector('[data-rule-field="max"]');
    const labelInput = item.querySelector('[data-rule-field="label"]');
    const cssSelect = item.querySelector('[data-rule-field="css"]');
    const maxVal = maxInput.value;
    rules.levels.push({
      max: maxVal === "Infinity" ? "Infinity" : (Number(maxVal) || 0),
      label: labelInput.value || "",
      css: cssSelect.value
    });
  });

  return rules;
}

function saveRiskRules() {
  const rules = collectRiskRulesFromForm();
  const result = updateRiskRules(rules);

  if (!result.success) {
    els.riskRulesErrors.innerHTML = `
      <strong>规则验证失败：</strong>
      <ul>${result.errors.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
    `;
    els.riskRulesErrors.style.display = "block";
    return;
  }

  els.riskRulesErrors.style.display = "none";
  syncAutoChecklist();
  saveState();
  renderAll();
  closeRiskRulesModal();
  alert("风险规则已保存！");
}

function resetRiskRules() {
  if (!confirm("确定要恢复为默认风险规则吗？当前的自定义设置将丢失。")) {
    return;
  }
  resetRiskRulesToDefault();
  renderRiskRulesForm();
  els.riskRulesErrors.style.display = "none";
  syncAutoChecklist();
  saveState();
  renderAll();
  alert("已恢复为默认风险规则！");
}

els.riskRulesBtn.addEventListener("click", openRiskRulesModal);
els.riskRulesModalClose.addEventListener("click", closeRiskRulesModal);
els.riskRulesModalBackdrop.addEventListener("click", closeRiskRulesModal);
els.riskRulesCancelBtn.addEventListener("click", closeRiskRulesModal);
els.riskRulesSaveBtn.addEventListener("click", saveRiskRules);
els.riskRulesResetBtn.addEventListener("click", resetRiskRules);

function getShiftTagClass(shift) {
  const map = {
    "正常": "shift-normal",
    "偏红": "shift-red",
    "偏青": "shift-cyan",
    "偏黄": "shift-yellow",
    "褪色": "shift-fade"
  };
  return map[shift] || "shift-normal";
}

function getThumbHtml(segment, index, size = "normal") {
  const width = size === "large" ? 60 : 48;
  const height = size === "large" ? 42 : 34;
  const placeholderClass = size === "large" ? "report-abnormal-thumb-placeholder" : "report-seg-thumb-placeholder";
  const imgClass = size === "large" ? "report-abnormal-thumb" : "report-seg-thumb";
  const bgColor = fallbackThumbs[index % fallbackThumbs.length];

  if (segment.thumb) {
    return `<img src="${segment.thumb}" alt="${escapeHtml(segment.code)}缩略图" class="${imgClass}" style="width:${width}px;height:${height}px" />`;
  }
  return `<div class="${placeholderClass}" style="background:${bgColor};width:${width}px;height:${height}px">${escapeHtml(segment.code)}</div>`;
}

function buildReportCover(reel, totalDuration, stats) {
  const createdDate = new Date(reel.createdAt);
  const createdDateStr = `${createdDate.getFullYear()}/${String(createdDate.getMonth() + 1).padStart(2, "0")}/${String(createdDate.getDate()).padStart(2, "0")}`;
  const now = new Date();
  const generatedDateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return `
    <div class="report-cover">
      <div class="report-cover-top">
        <div class="report-cover-eyebrow">离 线 试 映 报 告</div>
        <h1 class="report-cover-title">${escapeHtml(reel.title || "未命名胶片卷")}</h1>
        <p class="report-cover-subtitle">胶片分镜条核对台 · 自动生成报告</p>
        <div class="report-cover-film-icon">🎞️</div>
      </div>
      <div class="report-cover-info">
        <div class="report-cover-info-item">
          <span>胶片卷名称</span>
          <span>${escapeHtml(reel.title || "未命名")}</span>
        </div>
        <div class="report-cover-info-item">
          <span>总时长</span>
          <span>${formatDuration(totalDuration)}</span>
        </div>
        <div class="report-cover-info-item">
          <span>片段总数</span>
          <span>${reel.segments.length} 个</span>
        </div>
        <div class="report-cover-info-item">
          <span>高风险片段</span>
          <span>${stats.highRisk} 个</span>
        </div>
        <div class="report-cover-info-item">
          <span>破损片段</span>
          <span>${stats.damaged} 个</span>
        </div>
        <div class="report-cover-info-item">
          <span>创建时间</span>
          <span>${createdDateStr}</span>
        </div>
        <div class="report-cover-info-item">
          <span>检查单进度</span>
          <span>${stats.checklistCompleted} / ${stats.checklistTotal} 项</span>
        </div>
        <div class="report-cover-info-item">
          <span>报告生成时间</span>
          <span>${generatedDateStr}</span>
        </div>
      </div>
      <div class="report-cover-footer">
        本报告由胶片分镜条核对台自动生成 · 离线环境可用 · 可直接打印或保存
      </div>
    </div>
  `;
}

function buildReportSummary(reel, stats) {
  return `
    <div class="report-section">
      <h2 class="report-section-title">概览统计</h2>
      <div class="report-summary-grid">
        <div class="report-summary-card">
          <span class="report-summary-card-label">总片段数</span>
          <span class="report-summary-card-value">${reel.segments.length}</span>
        </div>
        <div class="report-summary-card">
          <span class="report-summary-card-label">总时长</span>
          <span class="report-summary-card-value">${formatDuration(stats.totalDuration)}</span>
        </div>
        <div class="report-summary-card">
          <span class="report-summary-card-label">破损片段</span>
          <span class="report-summary-card-value risk-high">${stats.damaged}</span>
        </div>
        <div class="report-summary-card">
          <span class="report-summary-card-label">高风险</span>
          <span class="report-summary-card-value risk-high">${stats.highRisk}</span>
        </div>
      </div>
      <div class="report-summary-grid">
        <div class="report-summary-card">
          <span class="report-summary-card-label">安全</span>
          <span class="report-summary-card-value risk-safe">${stats.safe}</span>
        </div>
        <div class="report-summary-card">
          <span class="report-summary-card-label">低风险</span>
          <span class="report-summary-card-value risk-low">${stats.lowRisk}</span>
        </div>
        <div class="report-summary-card">
          <span class="report-summary-card-label">中风险</span>
          <span class="report-summary-card-value risk-medium">${stats.mediumRisk}</span>
        </div>
        <div class="report-summary-card">
          <span class="report-summary-card-label">异常片段</span>
          <span class="report-summary-card-value risk-high">${stats.abnormal}</span>
        </div>
      </div>
      <div class="report-risk-bar">
        ${stats.safe > 0 ? `<div class="report-risk-bar-segment report-risk-bar-safe" style="width:${(stats.safe / reel.segments.length) * 100}%">安全 ${stats.safe}</div>` : ""}
        ${stats.lowRisk > 0 ? `<div class="report-risk-bar-segment report-risk-bar-low" style="width:${(stats.lowRisk / reel.segments.length) * 100}%">低 ${stats.lowRisk}</div>` : ""}
        ${stats.mediumRisk > 0 ? `<div class="report-risk-bar-segment report-risk-bar-medium" style="width:${(stats.mediumRisk / reel.segments.length) * 100}%">中 ${stats.mediumRisk}</div>` : ""}
        ${stats.highRisk > 0 ? `<div class="report-risk-bar-segment report-risk-bar-high" style="width:${(stats.highRisk / reel.segments.length) * 100}%">高 ${stats.highRisk}</div>` : ""}
      </div>
      <div class="report-risk-legend">
        <span class="report-risk-legend-item"><span class="report-risk-legend-dot" style="background:#4d7656"></span>安全</span>
        <span class="report-risk-legend-item"><span class="report-risk-legend-dot" style="background:#347d89"></span>低风险</span>
        <span class="report-risk-legend-item"><span class="report-risk-legend-dot" style="background:#d49b35"></span>中风险</span>
        <span class="report-risk-legend-item"><span class="report-risk-legend-dot" style="background:#b54d48"></span>高风险</span>
      </div>
    </div>
  `;
}

function buildReportSegmentsTable(reel) {
  const rows = reel.segments.map((seg, index) => {
    const risk = calculateSegmentRisk(seg);
    const hasDamage = seg.damage !== "完好";
    return `
      <tr>
        <td style="width:58px">${getThumbHtml(seg, index, "normal")}</td>
        <td style="width:50px;text-align:center;font-weight:700;color:#697179">${index + 1}</td>
        <td><span class="report-seg-code">${escapeHtml(seg.code)}</span></td>
        <td><span class="report-seg-duration">${formatDuration(seg.duration)}</span></td>
        <td><span class="report-tag ${getShiftTagClass(seg.shift)}">${escapeHtml(seg.shift)}</span></td>
        <td><span class="report-tag ${hasDamage ? "damage-bad" : "damage-ok"}">${escapeHtml(seg.damage)}</span></td>
        <td><span class="report-risk-badge ${risk.css}">${risk.label} ${risk.score}分</span></td>
        <td><span class="report-seg-note" title="${escapeHtml(seg.note || "无备注")}">${escapeHtml(seg.note || "—")}</span></td>
      </tr>
    `;
  }).join("");

  return `
    <div class="report-section">
      <h2 class="report-section-title">片段顺序清单</h2>
      <table class="report-segments-table">
        <thead>
          <tr>
            <th style="width:58px">缩略图</th>
            <th style="width:50px;text-align:center">序号</th>
            <th>片段编号</th>
            <th>时长</th>
            <th>颜色偏移</th>
            <th>破损情况</th>
            <th>风险等级</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function buildReportChecklist(reel, stats) {
  const autoItems = sortByPriority(reel.checklist.filter(item => item.source === "auto"));
  const manualItems = sortByPriority(reel.checklist.filter(item => item.source === "manual"));
  const progressPercent = stats.checklistTotal > 0 ? (stats.checklistCompleted / stats.checklistTotal) * 100 : 0;

  const renderChecklistItems = (items) => {
    if (items.length === 0) {
      return `<div style="padding:10px;color:#697179;font-size:11px">暂无项目</div>`;
    }
    return items.map(item => `
      <div class="report-checklist-item report-priority-${item.priority || "normal"} ${item.completed ? "completed" : ""}">
        <div class="report-checklist-checkbox ${item.completed ? "checked" : ""}">${item.completed ? "✓" : ""}</div>
        <span class="report-checklist-text">${escapeHtml(item.text)}</span>
        <span class="report-priority-badge report-priority-badge-${item.priority || "normal"}">${getPriorityLabel(item.priority)}</span>
        <span class="report-checklist-badge ${item.source}">${item.source === "auto" ? "自动" : "手动"}</span>
      </div>
    `).join("");
  };

  return `
    <div class="report-section">
      <h2 class="report-section-title">检查单完成情况</h2>
      <div class="report-checklist-progress">
        <span class="report-checklist-progress-text">${stats.checklistCompleted} / ${stats.checklistTotal} 项已完成</span>
        <div class="report-checklist-progress-bar">
          <div class="report-checklist-progress-fill" style="width:${progressPercent}%"></div>
        </div>
        <span style="font-weight:700;color:${progressPercent === 100 ? '#4d7656' : '#d49b35'}">${progressPercent.toFixed(0)}%</span>
      </div>
      <div class="report-checklist-group">
        <h3 class="report-checklist-group-title">自动待办（${autoItems.length} 项）</h3>
        ${renderChecklistItems(autoItems)}
      </div>
      <div class="report-checklist-group">
        <h3 class="report-checklist-group-title">临时检查项（${manualItems.length} 项）</h3>
        ${renderChecklistItems(manualItems)}
      </div>
    </div>
  `;
}

function buildReportAbnormal(reel, stats) {
  const abnormalSegments = reel.segments
    .map((seg, index) => ({ segment: seg, index, risk: calculateSegmentRisk(seg) }))
    .filter(item => item.segment.damage !== "完好" || item.segment.shift !== "正常" || item.risk.score > 0)
    .sort((a, b) => b.risk.score - a.risk.score);

  if (abnormalSegments.length === 0) {
    return `
      <div class="report-section">
        <h2 class="report-section-title">异常片段汇总</h2>
        <div style="padding:24px;text-align:center;color:#4d7656;font-weight:700;background:rgba(77,118,86,0.06);border-radius:6px;border:1px solid rgba(77,118,86,0.2)">
          ✓ 当前没有异常片段，所有片段状态良好
        </div>
      </div>
    `;
  }

  const cards = abnormalSegments.map(({ segment, index, risk }) => {
    const reasons = [];
    if (segment.shift !== "正常") reasons.push(segment.shift);
    if (segment.damage !== "完好") reasons.push(segment.damage);
    risk.reasons.forEach(r => reasons.push(r.split("(+")[0]));

    const uniqueReasons = [...new Set(reasons)];
    const cardClass = risk.score >= 7 ? "" : "medium";

    return `
      <div class="report-abnormal-card ${cardClass}">
        ${getThumbHtml(segment, index, "large")}
        <div class="report-abnormal-info">
          <span class="report-abnormal-code">${index + 1}. ${escapeHtml(segment.code)}</span>
          <div class="report-abnormal-reasons">
            ${uniqueReasons.map(r => `<span class="report-tag damage-bad">${escapeHtml(r)}</span>`).join("")}
          </div>
          ${segment.note ? `<span class="report-abnormal-note">${escapeHtml(segment.note)}</span>` : ""}
        </div>
        <div class="report-abnormal-meta">
          <span class="report-abnormal-duration">${formatDuration(segment.duration)}</span>
          <span class="report-risk-badge ${risk.css}">${risk.label} ${risk.score}分</span>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="report-section">
      <h2 class="report-section-title">异常片段汇总（${abnormalSegments.length} 项）</h2>
      <p style="color:#697179;font-size:11px;margin:0 0 12px">按风险评分从高到低排序，高风险片段（红色边框）需优先处理。</p>
      <div class="report-abnormal-list">
        ${cards}
      </div>
    </div>
  `;
}

function buildReportFooter(reel) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return `
    <div class="report-page-footer">
      <span>胶片卷：${escapeHtml(reel.title || "未命名")}</span>
      <span>报告生成时间：${dateStr}</span>
      <span>胶片分镜条核对台</span>
    </div>
  `;
}

function computeReportStats(reel) {
  const totalDuration = reel.segments.reduce((sum, s) => sum + Number(s.duration), 0);
  const damaged = reel.segments.filter(s => s.damage !== "完好").length;
  const abnormal = reel.segments.filter(s => s.damage !== "完好" || s.shift !== "正常").length;

  const riskResults = reel.segments.map(s => calculateSegmentRisk(s));
  const safe = riskResults.filter(r => r.css === "risk-safe").length;
  const lowRisk = riskResults.filter(r => r.css === "risk-low").length;
  const mediumRisk = riskResults.filter(r => r.css === "risk-medium").length;
  const highRisk = riskResults.filter(r => r.css === "risk-high").length;

  const checklistCompleted = reel.checklist.filter(c => c.completed).length;
  const checklistTotal = reel.checklist.length;

  return { totalDuration, damaged, abnormal, safe, lowRisk, mediumRisk, highRisk, checklistCompleted, checklistTotal };
}

function generateReportHtml() {
  const reel = getActiveReel();
  if (!reel) {
    return `<p style="padding:40px;text-align:center;color:#b54d48">没有可用的胶片卷数据。</p>`;
  }

  const stats = computeReportStats(reel);

  const coverHtml = buildReportCover(reel, stats.totalDuration, stats);
  const summaryHtml = buildReportSummary(reel, stats);
  const segmentsHtml = buildReportSegmentsTable(reel);
  const checklistHtml = buildReportChecklist(reel, stats);
  const abnormalHtml = buildReportAbnormal(reel, stats);
  const footerHtml = buildReportFooter(reel);

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <title>试映报告 - ${escapeHtml(reel.title || "未命名胶片卷")}</title>
      <style>
        ${document.querySelector('link[rel="stylesheet"]') ? "" : ""}
      </style>
      <link rel="stylesheet" href="styles.css" />
    </head>
    <body class="report-window-body">
      <div class="report-toolbar">
        <button type="button" onclick="window.print()" style="background:#1f2428;color:#fff;border-color:#1f2428;font-weight:700">🖨️ 打印报告</button>
        <button type="button" onclick="window.close()" style="background:#fffdf7">关闭</button>
      </div>
      <div class="report-container">
        ${coverHtml}
        ${summaryHtml}
        ${segmentsHtml}
        ${checklistHtml}
        ${abnormalHtml}
        ${footerHtml}
      </div>
    </body>
    </html>
  `;
}

function openReportWindow() {
  const reel = getActiveReel();
  if (!reel) {
    alert("没有可用的胶片卷数据。");
    return;
  }

  const reportHtml = generateReportHtml();
  const reportWindow = window.open("", "_blank", "width=950,height=1200,resizable=yes,scrollbars=yes,menubar=yes,toolbar=yes");

  if (!reportWindow) {
    alert("无法打开报告窗口，请检查浏览器的弹窗拦截设置。");
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();

  const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf("/") + 1);
  const baseTag = reportWindow.document.createElement("base");
  baseTag.href = baseUrl;
  reportWindow.document.head.appendChild(baseTag);
}

els.reportBtn.addEventListener("click", openReportWindow);

renderAll();
