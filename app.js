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
      case "restoreBackup":
        return new RestoreBackupCommand(data.previousState, data.newState, data.previousRiskRules, data.newRiskRules, data.mode);
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

class RestoreBackupCommand extends BaseCommand {
  constructor(previousState, newState, previousRiskRules, newRiskRules, mode) {
    super("restoreBackup");
    this.previousState = structuredClone(previousState);
    this.newState = structuredClone(newState);
    this.previousRiskRules = previousRiskRules ? structuredClone(previousRiskRules) : null;
    this.newRiskRules = newRiskRules ? structuredClone(newRiskRules) : null;
    this.mode = mode;
  }

  execute() {
    state = structuredClone(this.newState);
    if (this.newRiskRules) {
      restoreRulesFromBackup(this.newRiskRules);
    }
    saveState();
    renderAll();
  }

  undo() {
    state = structuredClone(this.previousState);
    if (this.previousRiskRules) {
      restoreRulesFromBackup(this.previousRiskRules);
    }
    saveState();
    renderAll();
  }

  getLabel() {
    return this.mode === "overwrite" ? "覆盖恢复备份数据" : "合并导入备份数据";
  }

  _getData() {
    return {
      previousState: this.previousState,
      newState: this.newState,
      previousRiskRules: this.previousRiskRules,
      newRiskRules: this.newRiskRules,
      mode: this.mode
    };
  }
}

const history = new HistoryManager();

const snapshotStorageKey = "zfl17-snapshots";
const MAX_SNAPSHOTS = 30;

const SNAPSHOT_OPERATION_LABELS = {
  batchImport: "批量导入",
  backupRestore: "备份恢复",
  reelDelete: "胶片卷删除",
  riskRuleChange: "风险规则调整",
  manual: "手动创建快照"
};

class SnapshotManager {
  constructor() {
    this.snapshots = [];
    this.load();
  }

  create(operationType) {
    const totalSegments = state.reels.reduce((sum, r) => sum + r.segments.length, 0);
    const snapshot = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      operationType: operationType || "manual",
      operationLabel: SNAPSHOT_OPERATION_LABELS[operationType] || operationType || "手动创建快照",
      reelCount: state.reels.length,
      segmentCount: totalSegments,
      templateCount: state.templates.length,
      state: structuredClone(state),
      riskRules: getSerializedRulesForBackup ? getSerializedRulesForBackup() : null
    };

    this.snapshots.unshift(snapshot);

    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots = this.snapshots.slice(0, MAX_SNAPSHOTS);
    }

    this.save();
    return snapshot;
  }

  restore(snapshotId) {
    const snapshot = this.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) return false;

    const migratedState = migrateLegacyState(snapshot.state);
    if (migratedState) {
      state = migratedState;
    } else if (snapshot.state && Array.isArray(snapshot.state.reels)) {
      state = structuredClone(snapshot.state);
      if (!state.version || state.version < 3) {
        state.version = 3;
      }
    } else {
      return false;
    }

    const validIds = state.reels.map((r) => r.id);
    if (!validIds.includes(state.activeReelId)) {
      state.activeReelId = validIds[0];
    }

    let compressedThumbCount = snapshot.state._thumbsCompressedCount || 0;
    state.reels.forEach((reel) => {
      if (reel.archived === undefined) reel.archived = false;
      if (!Array.isArray(reel.segments)) reel.segments = [];
      if (!Array.isArray(reel.checklist)) reel.checklist = [];
      reel.segments.forEach((seg) => {
        if (!seg.id) seg.id = crypto.randomUUID();
        if (seg._thumbCompressed) {
          delete seg._thumbCompressed;
        }
      });
      reel.checklist = reel.checklist.map((item) => ({
        priority: "normal",
        ...item
      }));
    });
    if (state._thumbsCompressedCount) {
      delete state._thumbsCompressedCount;
    }

    this._cleanOrphanedChecklistRefs();

    if (snapshot.riskRules) {
      const result = restoreRulesFromBackup(snapshot.riskRules);
      if (!result.success) {
        console.warn("快照恢复：风险规则恢复失败，保留当前规则");
      }
    }

    history.clear();

    saveState();
    state.reels.forEach((reel) => {
      syncAutoChecklist(reel);
    });
    renderAll();

    return true;
  }

  _cleanOrphanedChecklistRefs() {
    state.reels.forEach((reel) => {
      const segmentIds = new Set(reel.segments.map((s) => s.id));
      reel.checklist = reel.checklist.filter((item) => {
        if (item.source === "auto" && item.segmentId) {
          return segmentIds.has(item.segmentId);
        }
        return true;
      });
    });
  }

  preview(snapshotId) {
    const snapshot = this.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) return null;
    return {
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      operationLabel: snapshot.operationLabel,
      reelCount: snapshot.reelCount,
      segmentCount: snapshot.segmentCount,
      templateCount: snapshot.templateCount,
      reels: snapshot.state.reels.map((r) => ({
        title: r.title,
        segmentCount: r.segments.length,
        archived: r.archived || false
      })),
      templates: snapshot.state.templates.map((t) => t.name)
    };
  }

  delete(snapshotId) {
    this.snapshots = this.snapshots.filter((s) => s.id !== snapshotId);
    this.save();
  }

  deleteAll() {
    this.snapshots = [];
    this.save();
  }

  getList() {
    return this.snapshots.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      operationType: s.operationType,
      operationLabel: s.operationLabel,
      reelCount: s.reelCount,
      segmentCount: s.segmentCount,
      templateCount: s.templateCount
    }));
  }

  save() {
    try {
      const dataToSave = this.snapshots.map((s) => ({
        ...s,
        state: this._compressState(s.state)
      }));
      localStorage.setItem(snapshotStorageKey, JSON.stringify(dataToSave));
    } catch (e) {
      console.warn("快照保存失败，可能超出存储限制:", e);
      while (this.snapshots.length > 5) {
        this.snapshots.pop();
      }
      try {
        const dataToSave = this.snapshots.map((s) => ({
          ...s,
          state: this._compressState(s.state)
        }));
        localStorage.setItem(snapshotStorageKey, JSON.stringify(dataToSave));
      } catch (e2) {
        console.warn("快照精简后仍然保存失败:", e2);
      }
    }
  }

  _compressState(s) {
    if (!s || !Array.isArray(s.reels)) return s;
    const cloned = structuredClone(s);
    let thumbsCompressed = 0;
    cloned.reels.forEach((reel) => {
      if (Array.isArray(reel.segments)) {
        reel.segments = reel.segments.map((seg) => {
          if (seg.thumb && seg.thumb.length > 500) {
            thumbsCompressed++;
            return { ...seg, thumb: "", _thumbCompressed: true };
          }
          return seg;
        });
      }
    });
    if (thumbsCompressed > 0) {
      cloned._thumbsCompressedCount = thumbsCompressed;
    }
    return cloned;
  }

  load() {
    try {
      const saved = localStorage.getItem(snapshotStorageKey);
      if (!saved) {
        this.snapshots = [];
        return;
      }
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) {
        this.snapshots = [];
        return;
      }
      this.snapshots = parsed.filter((s) => s && s.id && s.state).map((s) => ({
        ...s,
        operationLabel: s.operationLabel || SNAPSHOT_OPERATION_LABELS[s.operationType] || s.operationType || "未知操作"
      }));
    } catch (e) {
      console.warn("快照加载失败:", e);
      this.snapshots = [];
    }
  }
}

const snapshotManager = new SnapshotManager();

function autoSnapshot(operationType) {
  try {
    const snapshot = snapshotManager.create(operationType);
    return snapshot;
  } catch (e) {
    console.warn("自动创建快照失败:", e);
    return null;
  }
}

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
    backupDiffSection: document.querySelector("#backupDiffSection"),
    backupDiffSummaryGrid: document.querySelector("#backupDiffSummaryGrid"),
    backupReelDiffList: document.querySelector("#backupReelDiffList"),
    backupTemplateDiffList: document.querySelector("#backupTemplateDiffList"),
    backupSelectAllReels: document.querySelector("#backupSelectAllReels"),
    backupSelectAllTemplates: document.querySelector("#backupSelectAllTemplates"),
    backupImpactInfo: document.querySelector("#backupImpactInfo"),
    backupImpactText: document.querySelector("#backupImpactText"),
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
    levelsRulesList: document.querySelector("#levelsRulesList"),

    reportConfigModalBackdrop: document.querySelector("#reportConfigModalBackdrop"),
    reportConfigModal: document.querySelector("#reportConfigModal"),
    reportConfigModalClose: document.querySelector("#reportConfigModalClose"),
    reportConfigCancelBtn: document.querySelector("#reportConfigCancelBtn"),
    reportConfigConfirmBtn: document.querySelector("#reportConfigConfirmBtn"),
    cfgCover: document.querySelector("#cfgCover"),
    cfgSummary: document.querySelector("#cfgSummary"),
    cfgSegments: document.querySelector("#cfgSegments"),
    cfgAbnormal: document.querySelector("#cfgAbnormal"),
    cfgChecklist: document.querySelector("#cfgChecklist"),
    cfgThumbs: document.querySelector("#cfgThumbs"),

    globalScheduleBtn: document.querySelector("#globalScheduleBtn"),
    globalScheduleBackdrop: document.querySelector("#globalScheduleBackdrop"),
    globalScheduleModal: document.querySelector("#globalScheduleModal"),
    globalScheduleClose: document.querySelector("#globalScheduleClose"),
    globalScheduleClearBtn: document.querySelector("#globalScheduleClearBtn"),
    globalScheduleReportBtn: document.querySelector("#globalScheduleReportBtn"),
    gsReelCount: document.querySelector("#gsReelCount"),
    gsTotalDuration: document.querySelector("#gsTotalDuration"),
    gsSegmentCount: document.querySelector("#gsSegmentCount"),
    gsHighRiskCount: document.querySelector("#gsHighRiskCount"),
    gsChecklistRate: document.querySelector("#gsChecklistRate"),
    globalReelPool: document.querySelector("#globalReelPool"),
    globalScheduleList: document.querySelector("#globalScheduleList"),
    gsReelOrderHint: document.querySelector("#gsReelOrderHint"),
    globalRiskBar: document.querySelector("#globalRiskBar"),
    globalRiskReelLabels: document.querySelector("#globalRiskReelLabels"),
    gsChecklistStats: document.querySelector("#gsChecklistStats"),
    gsChecklistProgress: document.querySelector("#gsChecklistProgress"),
    globalChecklistGrid: document.querySelector("#globalChecklistGrid"),
    globalAbnormalList: document.querySelector("#globalAbnormalList"),
    gsAbnormalHint: document.querySelector("#gsAbnormalHint"),

    snapshotBtn: document.querySelector("#snapshotBtn"),
    snapshotModalBackdrop: document.querySelector("#snapshotModalBackdrop"),
    snapshotModal: document.querySelector("#snapshotModal"),
    snapshotModalClose: document.querySelector("#snapshotModalClose"),
    snapshotCreateBtn: document.querySelector("#snapshotCreateBtn"),
    snapshotDeleteAllBtn: document.querySelector("#snapshotDeleteAllBtn"),
    snapshotCount: document.querySelector("#snapshotCount"),
    snapshotList: document.querySelector("#snapshotList"),
    snapshotPreviewSection: document.querySelector("#snapshotPreviewSection"),
    snapshotPreviewClose: document.querySelector("#snapshotPreviewClose"),
    previewSnapshotTime: document.querySelector("#previewSnapshotTime"),
    previewSnapshotOpType: document.querySelector("#previewSnapshotOpType"),
    previewSnapshotReels: document.querySelector("#previewSnapshotReels"),
    previewSnapshotSegments: document.querySelector("#previewSnapshotSegments"),
    previewSnapshotTemplates: document.querySelector("#previewSnapshotTemplates"),
    previewSnapshotReelList: document.querySelector("#previewSnapshotReelList"),
    previewSnapshotTemplateList: document.querySelector("#previewSnapshotTemplateList"),
    snapshotRestoreBtn: document.querySelector("#snapshotRestoreBtn"),
    snapshotCancelPreviewBtn: document.querySelector("#snapshotCancelPreviewBtn")
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

function syncAutoChecklist(targetReel) {
  const reel = targetReel || getActiveReel();
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

  autoSnapshot("reelDelete");

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

const batchImportManager = new window.BatchImport.BatchImportManager({
  els,
  getActiveReel,
  escapeHtml,
  generateId: () => crypto.randomUUID(),
  confirmDialog: (msg) => confirm(msg),
  beforeImport: () => autoSnapshot("batchImport"),
  commitImport: (reelId, segments, startIndex) => {
    history.execute(new BatchImportCommand(reelId, segments, startIndex));
  }
});

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
    if (els.snapshotModal.classList.contains("open")) {
      closeSnapshotModal();
    } else if (els.backupModal.classList.contains("open")) {
      closeBackupModal();
    } else if (batchImportManager?.isModalOpen()) {
      batchImportManager.closeModal();
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
let backupDiffResult = null;

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
  backupDiffResult = null;
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
  backupDiffResult = null;
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

function computeBackupDiff(backupData) {
  const currentReelsByTitle = {};
  state.reels.forEach((r) => {
    if (!currentReelsByTitle[r.title]) currentReelsByTitle[r.title] = [];
    currentReelsByTitle[r.title].push(r);
  });

  const currentReelsById = {};
  state.reels.forEach((r) => { currentReelsById[r.id] = r; });

  const currentTemplateIds = new Set(state.templates.map((t) => t.id));
  const currentTemplateNames = new Set(state.templates.map((t) => t.name));

  const reelDiffs = [];
  let newReelCount = 0;
  let sameNameReelCount = 0;
  let totalSegmentDiff = 0;
  let totalChecklistDiff = 0;

  backupData.reels.forEach((backupReel) => {
    const sameTitleCurrent = currentReelsByTitle[backupReel.title] || [];
    const sameIdCurrent = currentReelsById[backupReel.id];

    let diffType = "new";
    let sameNameMatch = null;
    let sameIdMatch = null;
    let segmentCountDiff = backupReel.segments.length;
    let checklistCountDiff = backupReel.checklist.length;
    let currentSegments = 0;
    let currentChecklist = 0;

    if (sameIdCurrent) {
      diffType = "sameId";
      sameIdMatch = sameIdCurrent;
      currentSegments = sameIdCurrent.segments.length;
      currentChecklist = sameIdCurrent.checklist.length;
      segmentCountDiff = backupReel.segments.length - sameIdCurrent.segments.length;
      checklistCountDiff = backupReel.checklist.length - sameIdCurrent.checklist.length;
    } else if (sameTitleCurrent.length > 0) {
      diffType = "sameName";
      sameNameReelCount++;
      sameNameMatch = sameTitleCurrent[0];
      currentSegments = sameTitleCurrent[0].segments.length;
      currentChecklist = sameTitleCurrent[0].checklist.length;
      segmentCountDiff = backupReel.segments.length - sameTitleCurrent[0].segments.length;
      checklistCountDiff = backupReel.checklist.length - sameTitleCurrent[0].checklist.length;
    } else {
      newReelCount++;
    }

    totalSegmentDiff += segmentCountDiff;
    totalChecklistDiff += checklistCountDiff;

    reelDiffs.push({
      reel: backupReel,
      diffType,
      sameNameMatch,
      sameIdMatch,
      currentSegments,
      currentChecklist,
      backupSegments: backupReel.segments.length,
      backupChecklist: backupReel.checklist.length,
      segmentCountDiff,
      checklistCountDiff,
      selected: true
    });
  });

  const templateDiffs = [];
  let newTemplateCount = 0;
  let sameNameTemplateCount = 0;
  let sameIdTemplateCount = 0;

  backupData.templates.forEach((backupTpl) => {
    let diffType = "new";
    const sameIdCurrent = state.templates.find((t) => t.id === backupTpl.id);
    const sameNameCurrent = state.templates.find((t) => t.name === backupTpl.name);

    if (sameIdCurrent) {
      diffType = "sameId";
      sameIdTemplateCount++;
    } else if (sameNameCurrent) {
      diffType = "sameName";
      sameNameTemplateCount++;
    } else {
      newTemplateCount++;
    }

    templateDiffs.push({
      template: backupTpl,
      diffType,
      sameIdMatch: sameIdCurrent,
      sameNameMatch: sameNameCurrent,
      selected: true
    });
  });

  return {
    reelDiffs,
    templateDiffs,
    summary: {
      newReelCount,
      sameNameReelCount,
      sameIdReelCount: reelDiffs.filter((r) => r.diffType === "sameId").length,
      totalSegmentDiff,
      totalChecklistDiff,
      newTemplateCount,
      sameNameTemplateCount,
      sameIdTemplateCount
    }
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
  backupDiffResult = computeBackupDiff(migratedData);
  renderBackupDiff();
  updateBackupImpactInfo();
  els.backupPreviewWrap.style.display = "flex";
  els.backupDiffSection.style.display = "block";
  els.backupImpactInfo.style.display = "block";
  els.backupConfirmBtn.disabled = false;
}

function renderBackupDiffSummary() {
  if (!backupDiffResult) return;
  const s = backupDiffResult.summary;
  const summaryItems = [
    { icon: "🆕", label: "新增胶片卷", value: `${s.newReelCount} 卷`, hint: "在当前工作区中不存在的卷" },
    { icon: "📛", label: "同名卷", value: `${s.sameNameReelCount} 卷`, hint: "名称相同但 ID 不同的卷，合并时需注意" },
    { icon: "🔄", label: "同 ID 卷", value: `${s.sameIdReelCount} 卷`, hint: "ID 完全相同的卷，合并时会生成新 ID" },
    { icon: "🎬", label: "片段数量变化", value: s.totalSegmentDiff >= 0 ? `+${s.totalSegmentDiff}` : `${s.totalSegmentDiff}`, hint: "备份比当前多或少的片段总数" },
    { icon: "✅", label: "检查项数量变化", value: s.totalChecklistDiff >= 0 ? `+${s.totalChecklistDiff}` : `${s.totalChecklistDiff}`, hint: "备份比当前多或少的检查项总数" },
    { icon: "📋", label: "模板差异", value: `新增 ${s.newTemplateCount} / 同名 ${s.sameNameTemplateCount} / 同ID ${s.sameIdTemplateCount}`, hint: "新增、同名冲突、同ID冲突的模板数" }
  ];
  els.backupDiffSummaryGrid.innerHTML = summaryItems.map(item => `
    <div class="backup-diff-summary-item">
      <div class="backup-diff-summary-icon">${item.icon}</div>
      <div class="backup-diff-summary-content">
        <div class="backup-diff-summary-label">${item.label}</div>
        <div class="backup-diff-summary-value">${item.value}</div>
        <div class="backup-diff-summary-hint">${item.hint}</div>
      </div>
    </div>
  `).join("");
}

function getDiffTypeBadge(diffType) {
  switch (diffType) {
    case "new":
      return `<span class="diff-badge diff-badge-new">新增</span>`;
    case "sameName":
      return `<span class="diff-badge diff-badge-same-name">同名冲突</span>`;
    case "sameId":
      return `<span class="diff-badge diff-badge-same-id">同ID冲突</span>`;
    default:
      return "";
  }
}

function renderBackupReelDiff() {
  if (!backupDiffResult) return;
  const isMergeMode = document.querySelector('input[name="backupMode"]:checked')?.value === "merge";

  els.backupReelDiffList.innerHTML = backupDiffResult.reelDiffs.map((diff, idx) => {
    const reel = diff.reel;
    const totalDuration = reel.segments.reduce((sum, s) => sum + Number(s.duration), 0);
    const segDiffText = diff.segmentCountDiff >= 0 ? `+${diff.segmentCountDiff}` : `${diff.segmentCountDiff}`;
    const checkDiffText = diff.checklistCountDiff >= 0 ? `+${diff.checklistCountDiff}` : `${diff.checklistCountDiff}`;

    let conflictInfo = "";
    if (diff.diffType === "sameName" && diff.sameNameMatch) {
      conflictInfo = `<div class="diff-conflict-info">⚠️ 与当前「${escapeHtml(diff.sameNameMatch.title)}」同名（片段 ${diff.currentSegments} 个）</div>`;
    } else if (diff.diffType === "sameId" && diff.sameIdMatch) {
      conflictInfo = `<div class="diff-conflict-info">🔄 与当前「${escapeHtml(diff.sameIdMatch.title)}」ID 相同，将生成新 ID</div>`;
    }

    return `
      <div class="backup-reel-diff-item ${diff.selected ? "selected" : ""}" data-reel-idx="${idx}">
        <label class="backup-diff-checkbox ${!isMergeMode ? "disabled" : ""}">
          <input type="checkbox" data-reel-select="${idx}" ${diff.selected ? "checked" : ""} ${!isMergeMode ? "disabled" : ""} />
          <span class="checkmark"></span>
        </label>
        <div class="backup-reel-diff-main">
          <div class="backup-reel-diff-title-row">
            <strong class="backup-reel-diff-title">${escapeHtml(reel.title)}</strong>
            ${getDiffTypeBadge(diff.diffType)}
            ${reel.archived ? `<span class="reel-badge archive-badge">已归档</span>` : ""}
          </div>
          <div class="backup-reel-diff-meta">
            <span>🎬 ${diff.backupSegments} 个片段 <em>(${segDiffText})</em></span>
            <span>⏱️ ${formatDuration(totalDuration)}</span>
            <span>✅ ${diff.backupChecklist} 项检查 <em>(${checkDiffText})</em></span>
          </div>
          ${conflictInfo}
        </div>
      </div>
    `;
  }).join("") || `<div class="empty">备份中没有胶片卷</div>`;

  if (els.backupSelectAllReels) {
    const allSelected = backupDiffResult.reelDiffs.every(d => d.selected);
    els.backupSelectAllReels.checked = allSelected;
    els.backupSelectAllReels.disabled = !isMergeMode;
  }
}

function renderBackupTemplateDiff() {
  if (!backupDiffResult) return;
  const isMergeMode = document.querySelector('input[name="backupMode"]:checked')?.value === "merge";

  els.backupTemplateDiffList.innerHTML = backupDiffResult.templateDiffs.map((diff, idx) => {
    const tpl = diff.template;

    let conflictInfo = "";
    if (diff.diffType === "sameName" && diff.sameNameMatch) {
      conflictInfo = `<div class="diff-conflict-info">⚠️ 与当前模板「${escapeHtml(diff.sameNameMatch.name)}」同名</div>`;
    } else if (diff.diffType === "sameId" && diff.sameIdMatch) {
      conflictInfo = `<div class="diff-conflict-info">🔄 与当前模板「${escapeHtml(diff.sameIdMatch.name)}」ID 相同，将生成新 ID</div>`;
    }

    return `
      <div class="backup-template-diff-item ${diff.selected ? "selected" : ""}" data-tpl-idx="${idx}">
        <label class="backup-diff-checkbox ${!isMergeMode ? "disabled" : ""}">
          <input type="checkbox" data-tpl-select="${idx}" ${diff.selected ? "checked" : ""} ${!isMergeMode ? "disabled" : ""} />
          <span class="checkmark"></span>
        </label>
        <div class="backup-template-diff-main">
          <div class="backup-template-diff-title-row">
            <strong class="backup-template-diff-title">${escapeHtml(tpl.name)}</strong>
            ${getDiffTypeBadge(diff.diffType)}
          </div>
          <div class="backup-template-diff-meta">
            <span>⏱️ ${formatDuration(tpl.duration)}</span>
            <span>🎨 ${escapeHtml(tpl.shift)}</span>
            <span>🔧 ${escapeHtml(tpl.damage)}</span>
          </div>
          ${conflictInfo}
        </div>
      </div>
    `;
  }).join("") || `<div class="empty">备份中没有模板</div>`;

  if (els.backupSelectAllTemplates) {
    const allSelected = backupDiffResult.templateDiffs.every(d => d.selected);
    els.backupSelectAllTemplates.checked = allSelected;
    els.backupSelectAllTemplates.disabled = !isMergeMode;
  }
}

function renderBackupDiff() {
  renderBackupDiffSummary();
  renderBackupReelDiff();
  renderBackupTemplateDiff();
}

function updateBackupImpactInfo() {
  if (!backupDiffResult || !backupParsedData) return;

  const mode = document.querySelector('input[name="backupMode"]:checked')?.value || "overwrite";
  const s = backupDiffResult.summary;
  const selectedReels = backupDiffResult.reelDiffs.filter(d => d.selected);
  const selectedTemplates = backupDiffResult.templateDiffs.filter(d => d.selected);
  const selectedSegmentCount = selectedReels.reduce((sum, d) => sum + d.backupSegments, 0);
  const selectedChecklistCount = selectedReels.reduce((sum, d) => sum + d.backupChecklist, 0);

  let impactHtml = "";

  if (mode === "overwrite") {
    impactHtml = `
      <ul class="backup-impact-list">
        <li><strong>覆盖模式</strong>：当前所有 <em>${state.reels.length}</em> 卷胶片、<em>${state.templates.length}</em> 个模板将被<strong>完全替换</strong>。</li>
        <li>将恢复备份中的 <em>${backupParsedData.reels.length}</em> 卷胶片（共 <em>${selectedSegmentCount}</em> 个片段、<em>${selectedChecklistCount}</em> 项检查）、<em>${backupParsedData.templates.length}</em> 个模板。</li>
        <li>当前未保存的修改将丢失，但<strong>可通过「撤销」恢复到恢复前的状态</strong>。</li>
        ${backupParsedData.riskRules ? `<li>备份包含风险评分规则，将同时恢复。</li>` : ""}
      </ul>
    `;
  } else {
    impactHtml = `
      <ul class="backup-impact-list">
        <li><strong>合并模式</strong>：已选择 <em>${selectedReels.length}/${backupDiffResult.reelDiffs.length}</em> 卷胶片、<em>${selectedTemplates.length}/${backupDiffResult.templateDiffs.length}</em> 个模板导入。</li>
        <li>将追加 <em>${selectedSegmentCount}</em> 个片段、<em>${selectedChecklistCount}</em> 项检查到当前工作区。</li>
        <li>同名/同ID冲突项将自动生成新标识，不影响现有数据。</li>
        <li>当前数据完全保留，<strong>可通过「撤销」撤销本次合并操作</strong>。</li>
      </ul>
    `;
  }

  els.backupImpactText.innerHTML = impactHtml;
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
    return { success: true, newState: structuredClone(newState) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function applyBackupMerge(backupData) {
  try {
    const selectedReels = backupDiffResult
      ? backupDiffResult.reelDiffs.filter(d => d.selected).map(d => d.reel)
      : backupData.reels;
    const selectedTemplates = backupDiffResult
      ? backupDiffResult.templateDiffs.filter(d => d.selected).map(d => d.template)
      : backupData.templates;

    const usedReelIds = new Set(state.reels.map((r) => r.id));
    const usedSegmentIds = new Set();
    const usedTemplateIds = new Set(state.templates.map((t) => t.id));
    const usedChecklistIds = new Set();

    state.reels.forEach((r) => {
      r.segments.forEach((s) => usedSegmentIds.add(s.id));
      r.checklist.forEach((c) => usedChecklistIds.add(c.id));
    });

    const filteredBackupData = {
      reels: selectedReels,
      templates: selectedTemplates
    };

    const normalizedData = normalizeImportedBackupData(filteredBackupData, {
      reels: usedReelIds,
      segments: usedSegmentIds,
      templates: usedTemplateIds,
      checklist: usedChecklistIds
    });

    const mergedReels = [...state.reels];
    normalizedData.reels.forEach((reelCopy, index) => {
      if (reelCopy.id !== selectedReels[index].id) {
        reelCopy.title = `${reelCopy.title}（导入）`;
      }

      mergedReels.push(reelCopy);
    });

    const mergedTemplates = [...state.templates];
    normalizedData.templates.forEach((tplCopy, index) => {
      if (tplCopy.id !== selectedTemplates[index].id) {
        tplCopy.name = `${tplCopy.name}（导入）`;
      }
      mergedTemplates.push(tplCopy);
    });

    state.reels = mergedReels;
    state.templates = mergedTemplates;
    saveState();
    renderAll();

    return {
      success: true,
      mergedCount: selectedReels.length + selectedTemplates.length,
      hasRiskRules: !!backupData.riskRules,
      newState: structuredClone(state)
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function confirmBackupRestore() {
  if (!backupParsedData) return;

  const mode = document.querySelector('input[name="backupMode"]:checked')?.value || "overwrite";

  autoSnapshot("backupRestore");

  let riskRulesRestored = false;
  if (mode === "merge" && backupParsedData.riskRules) {
    if (!confirm("备份文件中包含风险评分规则，是否同时导入这些规则？\n\n选择「确定」将用备份中的规则覆盖当前规则；选择「取消」将保留当前规则。")) {
      backupParsedData.riskRules = null;
    }
  }

  const previousState = structuredClone(state);
  const previousRiskRules = getSerializedRulesForBackup ? getSerializedRulesForBackup() : null;
  const newRiskRules = backupParsedData.riskRules || null;

  let result;
  if (mode === "overwrite") {
    result = applyBackupOverwrite(backupParsedData);
  } else {
    result = applyBackupMerge(backupParsedData);
  }

  if (!result.success) {
    alert(`恢复失败：${result.error}`);
    return;
  }

  if (backupParsedData.riskRules) {
    const restoreResult = restoreRulesFromBackup(backupParsedData.riskRules);
    riskRulesRestored = restoreResult.success;
  }

  const newState = structuredClone(state);
  const cmd = new RestoreBackupCommand(previousState, newState, previousRiskRules, newRiskRules, mode);
  history.execute(cmd);

  if (riskRulesRestored) {
    syncAutoChecklist();
    renderAll();
  }

  const selectedReels = backupDiffResult ? backupDiffResult.reelDiffs.filter(d => d.selected).length : backupParsedData.reels.length;
  const selectedTemplates = backupDiffResult ? backupDiffResult.templateDiffs.filter(d => d.selected).length : backupParsedData.templates.length;
  let successMsg = mode === "overwrite"
    ? "数据恢复成功！"
    : `合并成功！已追加 ${selectedReels} 卷胶片、${selectedTemplates} 个模板。`;
  if (riskRulesRestored) {
    successMsg += "\n风险评分规则已同步恢复。";
  }
  successMsg += "\n可通过「撤销」恢复到操作前的状态。";
  alert(successMsg);
  closeBackupModal();
}

function handleBackupModeChange() {
  if (backupDiffResult) {
    renderBackupDiff();
    updateBackupImpactInfo();
  }
}

function handleBackupReelSelect(idx, checked) {
  if (!backupDiffResult) return;
  backupDiffResult.reelDiffs[idx].selected = checked;
  renderBackupDiff();
  updateBackupImpactInfo();
}

function handleBackupTemplateSelect(idx, checked) {
  if (!backupDiffResult) return;
  backupDiffResult.templateDiffs[idx].selected = checked;
  renderBackupDiff();
  updateBackupImpactInfo();
}

function handleBackupSelectAllReels(checked) {
  if (!backupDiffResult) return;
  backupDiffResult.reelDiffs.forEach(d => { d.selected = checked; });
  renderBackupDiff();
  updateBackupImpactInfo();
}

function handleBackupSelectAllTemplates(checked) {
  if (!backupDiffResult) return;
  backupDiffResult.templateDiffs.forEach(d => { d.selected = checked; });
  renderBackupDiff();
  updateBackupImpactInfo();
}

els.backupBtn.addEventListener("click", openBackupModal);
els.backupModalClose.addEventListener("click", closeBackupModal);
els.backupModalBackdrop.addEventListener("click", closeBackupModal);
els.backupCancelBtn.addEventListener("click", closeBackupModal);
els.backupExportBtn.addEventListener("click", exportBackup);
els.backupFileInput.addEventListener("change", handleBackupFileSelect);
els.backupConfirmBtn.addEventListener("click", confirmBackupRestore);

document.addEventListener("change", (e) => {
  const target = e.target;
  if (target.name === "backupMode") {
    handleBackupModeChange();
  } else if (target.dataset.reelSelect !== undefined) {
    handleBackupReelSelect(Number(target.dataset.reelSelect), target.checked);
  } else if (target.dataset.tplSelect !== undefined) {
    handleBackupTemplateSelect(Number(target.dataset.tplSelect), target.checked);
  } else if (target.id === "backupSelectAllReels") {
    handleBackupSelectAllReels(target.checked);
  } else if (target.id === "backupSelectAllTemplates") {
    handleBackupSelectAllTemplates(target.checked);
  }
});

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
  const validation = validateRiskRules(rules);

  if (!validation.valid) {
    els.riskRulesErrors.innerHTML = `
      <strong>规则验证失败：</strong>
      <ul>${validation.errors.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
    `;
    els.riskRulesErrors.style.display = "block";
    return;
  }

  autoSnapshot("riskRuleChange");

  const result = updateRiskRules(rules);
  if (!result.success) {
    els.riskRulesErrors.innerHTML = `
      <strong>规则保存失败：</strong>
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
  autoSnapshot("riskRuleChange");
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

const REPORT_PRESETS = {
  screening: {
    cover: true,
    summary: true,
    segments: true,
    abnormal: false,
    checklist: false,
    thumbs: false
  },
  repair: {
    cover: true,
    summary: true,
    segments: true,
    abnormal: true,
    checklist: true,
    thumbs: true
  }
};

function getDefaultReportConfig() {
  return { ...REPORT_PRESETS.repair };
}

let currentReportConfig = getDefaultReportConfig();

function openReportConfigModal() {
  const reel = getActiveReel();
  if (!reel) {
    alert("没有可用的胶片卷数据。");
    return;
  }

  applyReportPreset("repair");

  els.reportConfigModalBackdrop.classList.add("open");
  els.reportConfigModal.classList.add("open");
  els.reportConfigModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeReportConfigModal() {
  els.reportConfigModalBackdrop.classList.remove("open");
  els.reportConfigModal.classList.remove("open");
  els.reportConfigModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function applyReportPreset(presetName) {
  const preset = REPORT_PRESETS[presetName] || getDefaultReportConfig();
  currentReportConfig = { ...preset };
  els.cfgCover.checked = preset.cover;
  els.cfgSummary.checked = preset.summary;
  els.cfgSegments.checked = preset.segments;
  els.cfgAbnormal.checked = preset.abnormal;
  els.cfgChecklist.checked = preset.checklist;
  els.cfgThumbs.checked = preset.thumbs;

  const radios = document.querySelectorAll('input[name="reportPreset"]');
  radios.forEach((r) => {
    r.checked = r.value === presetName;
  });
}

function collectReportConfig() {
  return {
    cover: els.cfgCover.checked,
    summary: els.cfgSummary.checked,
    segments: els.cfgSegments.checked,
    abnormal: els.cfgAbnormal.checked,
    checklist: els.cfgChecklist.checked,
    thumbs: els.cfgThumbs.checked
  };
}

function syncPresetFromConfig() {
  const cfg = collectReportConfig();
  let matchedPreset = null;
  for (const [name, preset] of Object.entries(REPORT_PRESETS)) {
    const match = Object.entries(preset).every(([key, val]) => cfg[key] === val);
    if (match) {
      matchedPreset = name;
      break;
    }
  }
  const radios = document.querySelectorAll('input[name="reportPreset"]');
  radios.forEach((r) => {
    r.checked = r.value === matchedPreset;
  });
}

function getThumbHtml(segment, index, size = "normal", showThumb = true) {
  if (!showThumb) return "";
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

function buildReportSegmentsTable(reel, config) {
  const showThumbs = config?.thumbs ?? true;
  const rows = reel.segments.map((seg, index) => {
    const risk = calculateSegmentRisk(seg);
    const hasDamage = seg.damage !== "完好";
    return `
      <tr>
        ${showThumbs ? `<td style="width:58px">${getThumbHtml(seg, index, "normal", showThumbs)}</td>` : ""}
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
            ${showThumbs ? `<th style="width:58px">缩略图</th>` : ""}
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

function buildReportAbnormal(reel, stats, config) {
  const showThumbs = config?.thumbs ?? true;
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

    const thumbHtml = getThumbHtml(segment, index, "large", showThumbs);
    const cardStyle = showThumbs ? "" : 'style="grid-template-columns:1fr auto"';

    return `
      <div class="report-abnormal-card ${cardClass}" ${cardStyle}>
        ${thumbHtml}
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

function generateReportHtml(config) {
  const reel = getActiveReel();
  if (!reel) {
    return `<p style="padding:40px;text-align:center;color:#b54d48">没有可用的胶片卷数据。</p>`;
  }

  const cfg = config || getDefaultReportConfig();
  const stats = computeReportStats(reel);

  const coverHtml = cfg.cover ? buildReportCover(reel, stats.totalDuration, stats) : "";
  const summaryHtml = cfg.summary ? buildReportSummary(reel, stats) : "";
  const segmentsHtml = cfg.segments ? buildReportSegmentsTable(reel, cfg) : "";
  const checklistHtml = cfg.checklist ? buildReportChecklist(reel, stats) : "";
  const abnormalHtml = cfg.abnormal ? buildReportAbnormal(reel, stats, cfg) : "";
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

function openReportWindow(config) {
  const reel = getActiveReel();
  if (!reel) {
    alert("没有可用的胶片卷数据。");
    return;
  }

  const cfg = config || getDefaultReportConfig();
  const reportHtml = generateReportHtml(cfg);
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

els.reportBtn.addEventListener("click", openReportConfigModal);

els.reportConfigModalClose.addEventListener("click", closeReportConfigModal);
els.reportConfigModalBackdrop.addEventListener("click", closeReportConfigModal);
els.reportConfigCancelBtn.addEventListener("click", closeReportConfigModal);

document.querySelectorAll('input[name="reportPreset"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    if (e.target.checked) {
      applyReportPreset(e.target.value);
    }
  });
});

[els.cfgCover, els.cfgSummary, els.cfgSegments, els.cfgAbnormal, els.cfgChecklist, els.cfgThumbs].forEach((checkbox) => {
  checkbox.addEventListener("change", syncPresetFromConfig);
});

els.reportConfigConfirmBtn.addEventListener("click", () => {
  const cfg = collectReportConfig();
  const hasAny = cfg.cover || cfg.summary || cfg.segments || cfg.abnormal || cfg.checklist;
  if (!hasAny) {
    alert("请至少选择一个报告章节。");
    return;
  }
  closeReportConfigModal();
  openReportWindow(cfg);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.reportConfigModal.getAttribute("aria-hidden") === "false") {
    closeReportConfigModal();
  }
  if (e.key === "Escape" && els.globalScheduleModal.getAttribute("aria-hidden") === "false") {
    closeGlobalScheduleModal();
  }
});

let globalScheduleState = {
  selectedReelIds: [],
  draggedReelId: null
};

const globalScheduleStorageKey = "zfl17-global-schedule";

function saveGlobalScheduleState() {
  try {
    localStorage.setItem(globalScheduleStorageKey, JSON.stringify({
      selectedReelIds: globalScheduleState.selectedReelIds
    }));
  } catch (e) {
    console.warn("Failed to save global schedule state:", e);
  }
}

function loadGlobalScheduleState() {
  try {
    const saved = localStorage.getItem(globalScheduleStorageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.selectedReelIds)) {
        const validIds = state.reels.map(r => r.id);
        globalScheduleState.selectedReelIds = parsed.selectedReelIds.filter(id => validIds.includes(id));
      }
    }
  } catch (e) {
    console.warn("Failed to load global schedule state:", e);
  }
}

function openGlobalScheduleModal() {
  loadGlobalScheduleState();
  els.globalScheduleBackdrop.classList.add("open");
  els.globalScheduleModal.classList.add("open");
  els.globalScheduleModal.setAttribute("aria-hidden", "false");
  renderGlobalSchedule();
}

function closeGlobalScheduleModal() {
  els.globalScheduleBackdrop.classList.remove("open");
  els.globalScheduleModal.classList.remove("open");
  els.globalScheduleModal.setAttribute("aria-hidden", "true");
}

function getGlobalSelectedReels() {
  return globalScheduleState.selectedReelIds
    .map(id => state.reels.find(r => r.id === id))
    .filter(Boolean);
}

function computeGlobalScheduleStats() {
  const reels = getGlobalSelectedReels();
  let totalDuration = 0;
  let totalSegments = 0;
  let highRiskCount = 0;
  let checklistTotal = 0;
  let checklistCompleted = 0;
  const allSegments = [];
  const abnormalSegments = [];

  reels.forEach((reel, reelIdx) => {
    const reelStartDuration = totalDuration;
    reel.segments.forEach((seg, segIdx) => {
      const risk = window.calculateSegmentRisk(seg);
      const absoluteStart = totalDuration;
      totalDuration += Number(seg.duration) || 0;
      totalSegments++;

      const segInfo = {
        ...seg,
        reelId: reel.id,
        reelTitle: reel.title,
        reelIndex: reelIdx,
        segmentReelIndex: segIdx,
        absoluteStart,
        absoluteEnd: totalDuration,
        risk
      };
      allSegments.push(segInfo);

      if (risk.css === "risk-high") {
        highRiskCount++;
      }
      if (seg.damage !== "完好" || seg.shift !== "正常" || risk.score >= 4) {
        abnormalSegments.push(segInfo);
      }
    });

    if (Array.isArray(reel.checklist)) {
      reel.checklist.forEach(item => {
        checklistTotal++;
        if (item.completed) {
          checklistCompleted++;
        }
      });
    }
  });

  abnormalSegments.sort((a, b) => b.risk.score - a.risk.score);

  return {
    reelCount: reels.length,
    totalDuration,
    totalSegments,
    highRiskCount,
    checklistTotal,
    checklistCompleted,
    checklistRate: checklistTotal > 0 ? Math.round((checklistCompleted / checklistTotal) * 100) : 0,
    allSegments,
    abnormalSegments,
    reels
  };
}

function renderGlobalReelPool() {
  const availableReels = state.reels.filter(r => !r.archived);
  const selectedIdSet = new Set(globalScheduleState.selectedReelIds);

  if (availableReels.length === 0) {
    els.globalReelPool.innerHTML = `<div class="reel-card-empty">尚未创建任何胶片卷</div>`;
    return;
  }

  els.globalReelPool.innerHTML = availableReels.map(reel => {
    const isAdded = selectedIdSet.has(reel.id);
    const segCount = reel.segments.length;
    const duration = reel.segments.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
    return `
      <div class="global-reel-pool-card ${isAdded ? "added" : ""}" 
           data-reel-id="${reel.id}" 
           ${isAdded ? "" : `title="点击加入排片"`}>
        <div class="global-reel-pool-info">
          <div class="global-reel-pool-title">${escapeHtml(reel.title)}</div>
          <div class="global-reel-pool-meta">${segCount} 段 · ${formatDuration(duration)}</div>
        </div>
        <button type="button" class="global-reel-pool-action" ${isAdded ? "disabled" : ""}>
          ${isAdded ? "✓" : "+"}
        </button>
      </div>
    `;
  }).join("");

  els.globalReelPool.querySelectorAll(".global-reel-pool-card:not(.added)").forEach(card => {
    card.addEventListener("click", () => {
      const reelId = card.dataset.reelId;
      if (!globalScheduleState.selectedReelIds.includes(reelId)) {
        globalScheduleState.selectedReelIds.push(reelId);
        saveGlobalScheduleState();
        renderGlobalSchedule();
      }
    });
  });
}

function renderGlobalScheduleList() {
  const reels = getGlobalSelectedReels();

  if (reels.length === 0) {
    els.globalScheduleList.innerHTML = "";
    els.gsReelOrderHint.textContent = "尚未选入任何胶片卷";
    return;
  }

  els.gsReelOrderHint.textContent = `共 ${reels.length} 卷，${formatDuration(reels.reduce((s, r) => s + r.segments.reduce((a, seg) => a + (Number(seg.duration) || 0), 0), 0))}`;

  els.globalScheduleList.innerHTML = reels.map((reel, idx) => {
    const duration = reel.segments.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
    const highRisk = reel.segments.filter(s => {
      const r = window.calculateSegmentRisk(s);
      return r.css === "risk-high";
    }).length;
    return `
      <div class="global-schedule-item" data-reel-id="${reel.id}" draggable="true">
        <div class="global-schedule-order">${idx + 1}</div>
        <div class="global-schedule-item-info">
          <div class="global-schedule-item-title">${escapeHtml(reel.title)}</div>
          <div class="global-schedule-item-meta">
            <span>🎞️ ${reel.segments.length} 段</span>
            <span>⏱️ ${formatDuration(duration)}</span>
            ${highRisk > 0 ? `<span style="color:var(--red)">⚠️ ${highRisk} 高风险</span>` : ""}
          </div>
        </div>
        <div class="global-schedule-item-move">
          <button type="button" class="global-schedule-move-btn" data-move="up" data-reel-id="${reel.id}" ${idx === 0 ? "disabled" : ""} title="上移">↑</button>
          <button type="button" class="global-schedule-move-btn" data-move="down" data-reel-id="${reel.id}" ${idx === reels.length - 1 ? "disabled" : ""} title="下移">↓</button>
        </div>
        <button type="button" class="global-schedule-item-remove" data-remove-reel="${reel.id}" title="移出排片">×</button>
      </div>
    `;
  }).join("");

  els.globalScheduleList.querySelectorAll(".global-schedule-move-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const reelId = btn.dataset.reelId;
      const move = btn.dataset.move;
      const currentIdx = globalScheduleState.selectedReelIds.indexOf(reelId);
      if (currentIdx === -1) return;

      if (move === "up" && currentIdx > 0) {
        const newIdx = currentIdx - 1;
        [globalScheduleState.selectedReelIds[currentIdx], globalScheduleState.selectedReelIds[newIdx]] = 
        [globalScheduleState.selectedReelIds[newIdx], globalScheduleState.selectedReelIds[currentIdx]];
        saveGlobalScheduleState();
        renderGlobalSchedule();
      } else if (move === "down" && currentIdx < globalScheduleState.selectedReelIds.length - 1) {
        const newIdx = currentIdx + 1;
        [globalScheduleState.selectedReelIds[currentIdx], globalScheduleState.selectedReelIds[newIdx]] = 
        [globalScheduleState.selectedReelIds[newIdx], globalScheduleState.selectedReelIds[currentIdx]];
        saveGlobalScheduleState();
        renderGlobalSchedule();
      }
    });
  });

  els.globalScheduleList.querySelectorAll("[data-remove-reel]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const reelId = btn.dataset.removeReel;
      globalScheduleState.selectedReelIds = globalScheduleState.selectedReelIds.filter(id => id !== reelId);
      saveGlobalScheduleState();
      renderGlobalSchedule();
    });
  });

  const items = els.globalScheduleList.querySelectorAll(".global-schedule-item");
  items.forEach(item => {
    item.addEventListener("dragstart", (e) => {
      globalScheduleState.draggedReelId = item.dataset.reelId;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      globalScheduleState.draggedReelId = null;
      items.forEach(i => i.classList.remove("drag-over"));
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      item.classList.add("drag-over");
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("drag-over");
    });

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drag-over");
      const targetReelId = item.dataset.reelId;
      const draggedId = globalScheduleState.draggedReelId;
      if (!draggedId || draggedId === targetReelId) return;

      const draggedIdx = globalScheduleState.selectedReelIds.indexOf(draggedId);
      const targetIdx = globalScheduleState.selectedReelIds.indexOf(targetReelId);
      if (draggedIdx === -1 || targetIdx === -1) return;

      globalScheduleState.selectedReelIds.splice(draggedIdx, 1);
      globalScheduleState.selectedReelIds.splice(targetIdx, 0, draggedId);
      saveGlobalScheduleState();
      renderGlobalSchedule();
    });
  });
}

function renderGlobalStats() {
  const stats = computeGlobalScheduleStats();

  els.gsReelCount.textContent = `${stats.reelCount} 卷`;
  els.gsTotalDuration.textContent = formatDuration(stats.totalDuration);
  els.gsSegmentCount.textContent = String(stats.totalSegments);
  els.gsHighRiskCount.textContent = String(stats.highRiskCount);
  els.gsChecklistRate.textContent = `${stats.checklistRate}%`;
}

function renderGlobalRiskDistribution() {
  const stats = computeGlobalScheduleStats();
  const reels = stats.reels;

  if (reels.length === 0 || stats.totalDuration === 0) {
    els.globalRiskBar.innerHTML = "";
    els.globalRiskReelLabels.innerHTML = "";
    return;
  }

  const totalDur = stats.totalDuration;
  const minPixelWidth = 8;
  const totalAvailableWidth = 1200;

  let html = "";
  const labelsHtml = [];

  reels.forEach((reel, reelIdx) => {
    if (reelIdx > 0) {
      html += `<div class="global-risk-reel-divider" title="卷分隔"></div>`;
    }

    const reelSegments = stats.allSegments.filter(s => s.reelId === reel.id);
    reelSegments.forEach(seg => {
      const dur = Number(seg.duration) || 0;
      const widthPct = (dur / totalDur) * 100;
      const widthPx = Math.max(minPixelWidth, (widthPct / 100) * totalAvailableWidth);
      const risk = seg.risk;
      html += `
        <div class="global-risk-segment ${risk.css}" 
             style="width:${widthPct}%; min-width:${widthPx}px"
             title="${escapeHtml(reel.title)} - ${escapeHtml(seg.code)}&#10;时长: ${dur}秒&#10;风险: ${risk.label} (${risk.score}分)&#10;位置: ${formatDuration(seg.absoluteStart)} - ${formatDuration(seg.absoluteEnd)}">
        </div>
      `;
    });

    const reelDur = reel.segments.reduce((s, seg) => s + (Number(seg.duration) || 0), 0);
    labelsHtml.push(`
      <span class="global-risk-reel-tag">
        <span class="global-risk-reel-tag-dot"></span>
        第${reelIdx + 1}卷 · ${escapeHtml(reel.title)} · ${formatDuration(reelDur)}
      </span>
    `);
  });

  els.globalRiskBar.innerHTML = html;
  els.globalRiskReelLabels.innerHTML = labelsHtml.join("");
}

function renderGlobalChecklist() {
  const stats = computeGlobalScheduleStats();
  const reels = stats.reels;

  els.gsChecklistStats.textContent = `${stats.checklistCompleted} / ${stats.checklistTotal} 项已完成`;
  els.gsChecklistProgress.style.width = `${stats.checklistRate}%`;

  if (reels.length === 0) {
    els.globalChecklistGrid.innerHTML = "";
    return;
  }

  const prioritySort = { urgent: 0, important: 1, normal: 2 };

  els.globalChecklistGrid.innerHTML = reels.map(reel => {
    const items = Array.isArray(reel.checklist) ? [...reel.checklist].sort((a, b) => {
      const pa = prioritySort[a.priority] ?? 2;
      const pb = prioritySort[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.completed ? 1 : 0) - (b.completed ? 1 : 0);
    }) : [];
    const completed = items.filter(i => i.completed).length;
    const total = items.length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const allDone = total > 0 && completed === total;

    return `
      <div class="global-checklist-reel-card">
        <div class="global-checklist-reel-head">
          <span class="global-checklist-reel-title" title="${escapeHtml(reel.title)}">${escapeHtml(reel.title)}</span>
          <span class="global-checklist-reel-rate ${allDone ? "done" : ""}">${rate}%</span>
        </div>
        <div class="global-checklist-mini">
          ${items.length === 0 ? 
            `<div class="global-checklist-mini-item" style="opacity:0.6">
              <span class="global-checklist-mini-dot"></span>
              暂无待办项
            </div>` :
            items.slice(0, 8).map(item => `
              <div class="global-checklist-mini-item priority-${item.priority || "normal"} ${item.completed ? "done" : ""}" title="${escapeHtml(item.text)}">
                <span class="global-checklist-mini-dot"></span>
                <span>${escapeHtml(item.text.length > 24 ? item.text.slice(0, 24) + "…" : item.text)}</span>
              </div>
            `).join("")
          }
          ${items.length > 8 ? `
            <div class="global-checklist-mini-item" style="opacity:0.6">
              <span class="global-checklist-mini-dot" style="background:transparent"></span>
              <span>...还有 ${items.length - 8} 项</span>
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderGlobalAbnormal() {
  const stats = computeGlobalScheduleStats();
  const abnormal = stats.abnormalSegments;

  els.gsAbnormalHint.textContent = `共 ${abnormal.length} 条异常`;

  if (abnormal.length === 0) {
    els.globalAbnormalList.innerHTML = "";
    return;
  }

  els.globalAbnormalList.innerHTML = abnormal.slice(0, 50).map(seg => {
    const tags = [];
    if (seg.shift !== "正常") {
      tags.push(`<span class="global-abnormal-tag">${escapeHtml(seg.shift)}</span>`);
    }
    if (seg.damage !== "完好") {
      tags.push(`<span class="global-abnormal-tag damage-tag">${escapeHtml(seg.damage)}</span>`);
    }
    return `
      <div class="global-abnormal-item">
        <span class="global-abnormal-reel-tag">第${seg.reelIndex + 1}卷</span>
        <div class="global-abnormal-main">
          <div class="global-abnormal-code-row">
            <span class="global-abnormal-code">${escapeHtml(seg.code)}</span>
            <span class="global-abnormal-risk-tag ${seg.risk.css}">${seg.risk.label} ${seg.risk.score}分</span>
            <div class="global-abnormal-tags">${tags.join("")}</div>
          </div>
          ${seg.note ? `<div class="global-abnormal-note">${escapeHtml(seg.note)}</div>` : ""}
        </div>
        <span class="global-abnormal-duration">${formatDuration(seg.absoluteStart)} - ${formatDuration(seg.absoluteEnd)}</span>
      </div>
    `;
  }).join("");
}

function renderGlobalSchedule() {
  renderGlobalReelPool();
  renderGlobalScheduleList();
  renderGlobalStats();
  renderGlobalRiskDistribution();
  renderGlobalChecklist();
  renderGlobalAbnormal();
}

function clearGlobalSchedule() {
  if (globalScheduleState.selectedReelIds.length === 0) return;
  if (!confirm("确定要清空当前排片吗？已选的胶片卷顺序将被重置。")) return;
  globalScheduleState.selectedReelIds = [];
  saveGlobalScheduleState();
  renderGlobalSchedule();
}

function buildGlobalReportCover(stats) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `
    <div class="report-cover">
      <h1>联合试映报告</h1>
      <p class="report-cover-subtitle">跨胶片卷全局排片 · ${dateStr}</p>
      <div class="report-cover-meta">
        <div><strong>${stats.reelCount}</strong><span>胶片卷数</span></div>
        <div><strong>${stats.totalSegments}</strong><span>片段总数</span></div>
        <div><strong>${formatDuration(stats.totalDuration)}</strong><span>总时长</span></div>
        <div><strong>${stats.highRiskCount}</strong><span>高风险片段</span></div>
        <div><strong>${stats.checklistCompleted}/${stats.checklistTotal}</strong><span>待办完成</span></div>
      </div>
    </div>
  `;
}

function buildGlobalReportReelOrder(stats) {
  if (stats.reels.length === 0) return "";
  return `
    <section class="report-section">
      <h2>卷排片顺序</h2>
      <table class="report-table">
        <thead>
          <tr>
            <th>顺序</th>
            <th>胶片卷名称</th>
            <th>片段数</th>
            <th>时长</th>
            <th>起始时间</th>
            <th>结束时间</th>
            <th>高风险</th>
          </tr>
        </thead>
        <tbody>
          ${(function() {
            let runningTime = 0;
            return stats.reels.map((reel, idx) => {
              const segCount = reel.segments.length;
              const dur = reel.segments.reduce((s, seg) => s + (Number(seg.duration) || 0), 0);
              const highRisk = reel.segments.filter(s => {
                const r = window.calculateSegmentRisk(s);
                return r.css === "risk-high";
              }).length;
              const start = runningTime;
              runningTime += dur;
              return `
                <tr>
                  <td><strong>第 ${idx + 1} 卷</strong></td>
                  <td>${escapeHtml(reel.title)}</td>
                  <td>${segCount}</td>
                  <td>${formatDuration(dur)}</td>
                  <td>${formatDuration(start)}</td>
                  <td>${formatDuration(runningTime)}</td>
                  <td>${highRisk > 0 ? `<span class="risk-badge risk-high">${highRisk}</span>` : "0"}</td>
                </tr>
              `;
            }).join("");
          })()}
        </tbody>
      </table>
    </section>
  `;
}

function buildGlobalReportSegmentsTable(stats, includeThumbs) {
  if (stats.allSegments.length === 0) return "";
  return `
    <section class="report-section">
      <h2>完整片段顺序表</h2>
      <table class="report-table">
        <thead>
          <tr>
            ${includeThumbs ? "<th>缩略图</th>" : ""}
            <th>全局序</th>
            <th>卷</th>
            <th>片段</th>
            <th>时长</th>
            <th>起始</th>
            <th>结束</th>
            <th>颜色</th>
            <th>破损</th>
            <th>风险</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          ${stats.allSegments.map((seg, idx) => `
            <tr class="${seg.damage !== "完好" ? "abnormal-row" : ""}">
              ${includeThumbs ? `<td>${seg.thumb ? `<img src="${seg.thumb}" class="report-thumb" />` : '<div class="report-thumb-placeholder">—</div>'}</td>` : ""}
              <td><strong>#${idx + 1}</strong></td>
              <td>第${seg.reelIndex + 1}卷</td>
              <td><strong>${escapeHtml(seg.code)}</strong></td>
              <td>${seg.duration}s</td>
              <td>${formatDuration(seg.absoluteStart)}</td>
              <td>${formatDuration(seg.absoluteEnd)}</td>
              <td>${escapeHtml(seg.shift)}</td>
              <td>${seg.damage !== "完好" ? `<span class="risk-badge risk-high">${escapeHtml(seg.damage)}</span>` : escapeHtml(seg.damage)}</td>
              <td><span class="risk-badge ${seg.risk.css}">${seg.risk.label} ${seg.risk.score}</span></td>
              <td>${escapeHtml(seg.note || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function buildGlobalReportAbnormal(stats, includeThumbs) {
  if (stats.abnormalSegments.length === 0) return "";
  return `
    <section class="report-section report-abnormal-section">
      <h2>异常片段汇总（${stats.abnormalSegments.length} 条）</h2>
      <table class="report-table">
        <thead>
          <tr>
            ${includeThumbs ? "<th>缩略图</th>" : ""}
            <th>卷</th>
            <th>片段</th>
            <th>风险等级</th>
            <th>分值</th>
            <th>颜色偏移</th>
            <th>破损情况</th>
            <th>位置</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          ${stats.abnormalSegments.map(seg => `
            <tr>
              ${includeThumbs ? `<td>${seg.thumb ? `<img src="${seg.thumb}" class="report-thumb" />` : '<div class="report-thumb-placeholder">—</div>'}</td>` : ""}
              <td>第${seg.reelIndex + 1}卷</td>
              <td><strong>${escapeHtml(seg.code)}</strong></td>
              <td><span class="risk-badge ${seg.risk.css}">${seg.risk.label}</span></td>
              <td><strong>${seg.risk.score}</strong></td>
              <td>${escapeHtml(seg.shift)}</td>
              <td>${escapeHtml(seg.damage)}</td>
              <td>${formatDuration(seg.absoluteStart)} - ${formatDuration(seg.absoluteEnd)}</td>
              <td>${escapeHtml(seg.note || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function buildGlobalReportChecklist(stats) {
  if (stats.reels.length === 0) return "";
  return `
    <section class="report-section">
      <h2>检查单完成进度</h2>
      <div class="report-checklist-overview">
        <div class="report-checklist-progress-bar">
          <div class="report-checklist-progress-fill" style="width:${stats.checklistRate}%"></div>
        </div>
        <p><strong>${stats.checklistCompleted} / ${stats.checklistTotal}</strong> 项已完成（${stats.checklistRate}%）</p>
      </div>
      ${stats.reels.map(reel => {
        const items = Array.isArray(reel.checklist) ? reel.checklist : [];
        if (items.length === 0) return "";
        const done = items.filter(i => i.completed).length;
        const rate = Math.round((done / items.length) * 100);
        return `
          <div class="report-checklist-reel-section">
            <h3>${escapeHtml(reel.title)} <span class="report-checklist-reel-rate">${done}/${items.length} (${rate}%)</span></h3>
            <ul class="report-checklist-ul">
              ${items.map(item => `
                <li class="${item.completed ? "checked" : ""} priority-${item.priority || "normal"}">
                  <span class="report-checklist-box">${item.completed ? "✓" : ""}</span>
                  <span>${escapeHtml(item.text)}</span>
                  <span class="report-checklist-src">${item.source === "auto" ? "自动" : "手动"}</span>
                </li>
              `).join("")}
            </ul>
          </div>
        `;
      }).join("")}
    </section>
  `;
}

function buildGlobalReportFooter(stats) {
  const now = new Date();
  return `
    <footer class="report-footer">
      <p>本报告由 胶片分镜条核对台 · 全局排片视图 生成</p>
      <p>生成时间：${now.toLocaleString("zh-CN")} · 共 ${stats.reelCount} 卷 · ${stats.totalSegments} 段 · ${formatDuration(stats.totalDuration)}</p>
    </footer>
  `;
}

function generateGlobalReportHtml(config) {
  const stats = computeGlobalScheduleStats();

  if (stats.reelCount === 0) {
    return `
      <!DOCTYPE html>
      <html lang="zh-CN"><head><meta charset="UTF-8"><title>联合试映报告</title><link rel="stylesheet" href="styles.css" /></head>
      <body class="report-window-body">
        <div class="report-toolbar">
          <button type="button" onclick="window.close()" style="background:#fffdf7">关闭</button>
        </div>
        <p style="padding:60px;text-align:center;color:#b54d48;font-size:18px">尚未选择任何胶片卷加入排片。请先在全局排片中选入胶片卷。</p>
      </body></html>
    `;
  }

  const cfg = Object.assign({
    cover: true,
    summary: true,
    segments: true,
    abnormal: true,
    checklist: true,
    thumbs: true
  }, config || {});
  if (typeof cfg.includeCover === "boolean") cfg.cover = cfg.includeCover;
  if (typeof cfg.includeReelOrder === "boolean") cfg.summary = cfg.includeReelOrder;
  if (typeof cfg.includeSegments === "boolean") cfg.segments = cfg.includeSegments;
  if (typeof cfg.includeAbnormal === "boolean") cfg.abnormal = cfg.includeAbnormal;
  if (typeof cfg.includeChecklist === "boolean") cfg.checklist = cfg.includeChecklist;
  if (typeof cfg.includeThumbs === "boolean") cfg.thumbs = cfg.includeThumbs;

  const coverHtml = cfg.cover ? buildGlobalReportCover(stats) : "";
  const orderHtml = cfg.summary ? buildGlobalReportReelOrder(stats) : "";
  const segmentsHtml = cfg.segments ? buildGlobalReportSegmentsTable(stats, cfg.thumbs) : "";
  const abnormalHtml = cfg.abnormal ? buildGlobalReportAbnormal(stats, cfg.thumbs) : "";
  const checklistHtml = cfg.checklist ? buildGlobalReportChecklist(stats) : "";
  const footerHtml = buildGlobalReportFooter(stats);

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <title>联合试映报告 - ${stats.reelCount}卷 · ${formatDuration(stats.totalDuration)}</title>
      <link rel="stylesheet" href="styles.css" />
    </head>
    <body class="report-window-body">
      <div class="report-toolbar">
        <button type="button" onclick="window.print()" style="background:#1f2428;color:#fff;border-color:#1f2428;font-weight:700">🖨️ 打印报告</button>
        <button type="button" onclick="window.close()" style="background:#fffdf7">关闭</button>
      </div>
      <div class="report-container">
        ${coverHtml}
        ${orderHtml}
        ${segmentsHtml}
        ${abnormalHtml}
        ${checklistHtml}
        ${footerHtml}
      </div>
    </body>
    </html>
  `;
}

function openGlobalReportWindow() {
  const stats = computeGlobalScheduleStats();
  if (stats.reelCount === 0) {
    alert("请先选择至少一个胶片卷加入排片。");
    return;
  }

  const reportHtml = generateGlobalReportHtml();
  const reportWindow = window.open("", "_blank", "width=1050,height=1250,resizable=yes,scrollbars=yes,menubar=yes,toolbar=yes");

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

els.globalScheduleBtn.addEventListener("click", openGlobalScheduleModal);
els.globalScheduleClose.addEventListener("click", closeGlobalScheduleModal);
els.globalScheduleBackdrop.addEventListener("click", closeGlobalScheduleModal);
els.globalScheduleClearBtn.addEventListener("click", clearGlobalSchedule);
els.globalScheduleReportBtn.addEventListener("click", openGlobalReportWindow);

loadGlobalScheduleState();

let currentPreviewSnapshotId = null;

function openSnapshotModal() {
  els.snapshotModal.classList.add("open");
  els.snapshotModalBackdrop.classList.add("open");
  els.snapshotModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  currentPreviewSnapshotId = null;
  els.snapshotPreviewSection.style.display = "none";
  renderSnapshotList();
}

function closeSnapshotModal() {
  els.snapshotModal.classList.remove("open");
  els.snapshotModalBackdrop.classList.remove("open");
  els.snapshotModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  currentPreviewSnapshotId = null;
}

function formatSnapshotTime(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function renderSnapshotList() {
  const list = snapshotManager.getList();
  els.snapshotCount.textContent = `${list.length} 个快照`;

  if (list.length === 0) {
    els.snapshotList.innerHTML = `<div class="snapshot-empty">暂无快照，执行高影响操作时会自动创建</div>`;
    return;
  }

  els.snapshotList.innerHTML = list.map((s) => `
    <div class="snapshot-item" data-snapshot-id="${s.id}">
      <div class="snapshot-item-main">
        <div class="snapshot-item-time">${formatSnapshotTime(s.createdAt)}</div>
        <div class="snapshot-item-meta">
          <span class="snapshot-op-badge ${s.operationType}">${escapeHtml(s.operationLabel)}</span>
          <span>🎞️ ${s.reelCount} 卷</span>
          <span>🎬 ${s.segmentCount} 段</span>
          <span>📋 ${s.templateCount} 模板</span>
        </div>
      </div>
      <div class="snapshot-item-actions">
        <button type="button" class="snapshot-action-btn snapshot-preview-btn" data-preview-snapshot="${s.id}">预览</button>
        <button type="button" class="snapshot-action-btn snapshot-restore-item-btn" data-restore-snapshot="${s.id}">恢复</button>
        <button type="button" class="snapshot-action-btn snapshot-delete-btn" data-delete-snapshot="${s.id}">✕</button>
      </div>
    </div>
  `).join("");
}

function showSnapshotPreview(snapshotId) {
  const preview = snapshotManager.preview(snapshotId);
  if (!preview) {
    alert("无法预览此快照，数据可能已损坏。");
    return;
  }

  currentPreviewSnapshotId = snapshotId;

  els.previewSnapshotTime.textContent = formatSnapshotTime(preview.createdAt);
  els.previewSnapshotOpType.innerHTML = `<span class="snapshot-op-badge ${preview.operationType || 'manual'}">${escapeHtml(preview.operationLabel)}</span>`;
  els.previewSnapshotReels.textContent = `${preview.reelCount} 卷`;
  els.previewSnapshotSegments.textContent = `${preview.segmentCount} 个`;
  els.previewSnapshotTemplates.textContent = `${preview.templateCount} 个`;

  if (preview.reels && preview.reels.length > 0) {
    els.previewSnapshotReelList.innerHTML = `<h4>胶片卷</h4>` + preview.reels.map((r) => `
      <div class="snapshot-preview-reel-item">
        <span>${escapeHtml(r.title)}${r.archived ? "（已归档）" : ""}</span>
        <span class="reel-seg-count">${r.segmentCount} 段</span>
      </div>
    `).join("");
  } else {
    els.previewSnapshotReelList.innerHTML = "";
  }

  if (preview.templates && preview.templates.length > 0) {
    els.previewSnapshotTemplateList.innerHTML = `<h4>模板</h4>` + preview.templates.map((t) => `
      <div class="snapshot-preview-template-item">
        <span>${escapeHtml(t)}</span>
      </div>
    `).join("");
  } else {
    els.previewSnapshotTemplateList.innerHTML = "";
  }

  els.snapshotPreviewSection.style.display = "flex";
}

function hideSnapshotPreview() {
  currentPreviewSnapshotId = null;
  els.snapshotPreviewSection.style.display = "none";
}

function handleSnapshotRestore(snapshotId) {
  const preview = snapshotManager.preview(snapshotId);
  if (!preview) {
    alert("无法恢复此快照。");
    return;
  }

  const snapshot = snapshotManager.snapshots.find((s) => s.id === snapshotId);
  let thumbWarning = "";
  let compressedCount = 0;
  if (snapshot && snapshot.state._thumbsCompressedCount) {
    compressedCount = snapshot.state._thumbsCompressedCount;
    thumbWarning = `\n\n注意：由于存储优化，此快照中有 ${compressedCount} 个缩略图已被压缩，恢复后需要重新上传。`;
  }

  if (!confirm(`确定要恢复到快照「${formatSnapshotTime(preview.createdAt)}」吗？\n\n当前所有数据将被替换，撤销重做历史将被清除。\n此操作不可撤销。${thumbWarning}`)) return;

  const success = snapshotManager.restore(snapshotId);
  if (success) {
    let message = "快照恢复成功！撤销重做历史已清除。";
    if (compressedCount > 0) {
      message += `\n\n有 ${compressedCount} 个缩略图已被压缩，如需恢复请重新上传。`;
    }
    alert(message);
    renderSnapshotList();
    hideSnapshotPreview();
  } else {
    alert("快照恢复失败，数据可能已损坏。");
  }
}

function handleSnapshotDelete(snapshotId) {
  if (!confirm("确定要删除此快照吗？删除后无法恢复。")) return;
  snapshotManager.delete(snapshotId);
  if (currentPreviewSnapshotId === snapshotId) {
    hideSnapshotPreview();
  }
  renderSnapshotList();
}

function handleSnapshotDeleteAll() {
  const list = snapshotManager.getList();
  if (list.length === 0) return;
  if (!confirm(`确定要清空全部 ${list.length} 个快照吗？此操作不可撤销。`)) return;
  snapshotManager.deleteAll();
  hideSnapshotPreview();
  renderSnapshotList();
}

function handleManualSnapshot() {
  const snapshot = autoSnapshot("manual");
  if (snapshot) {
    alert("快照创建成功！");
    renderSnapshotList();
  } else {
    alert("快照创建失败，可能超出存储限制。");
  }
}

els.snapshotBtn.addEventListener("click", openSnapshotModal);
els.snapshotModalClose.addEventListener("click", closeSnapshotModal);
els.snapshotModalBackdrop.addEventListener("click", closeSnapshotModal);
els.snapshotCreateBtn.addEventListener("click", handleManualSnapshot);
els.snapshotDeleteAllBtn.addEventListener("click", handleSnapshotDeleteAll);
els.snapshotPreviewClose.addEventListener("click", hideSnapshotPreview);
els.snapshotCancelPreviewBtn.addEventListener("click", hideSnapshotPreview);
els.snapshotRestoreBtn.addEventListener("click", () => {
  if (currentPreviewSnapshotId) {
    handleSnapshotRestore(currentPreviewSnapshotId);
  }
});

els.snapshotList.addEventListener("click", (event) => {
  const previewBtn = event.target.closest("[data-preview-snapshot]");
  const restoreBtn = event.target.closest("[data-restore-snapshot]");
  const deleteBtn = event.target.closest("[data-delete-snapshot]");

  if (previewBtn) {
    event.stopPropagation();
    showSnapshotPreview(previewBtn.dataset.previewSnapshot);
  } else if (restoreBtn) {
    event.stopPropagation();
    handleSnapshotRestore(restoreBtn.dataset.restoreSnapshot);
  } else if (deleteBtn) {
    event.stopPropagation();
    handleSnapshotDelete(deleteBtn.dataset.deleteSnapshot);
  }
});

renderAll();

window.state = state;
window.appHistory = history;
window.snapshotManager = snapshotManager;
window.getActiveReel = getActiveReel;
window.renderAll = renderAll;
window.saveState = saveState;

window.HistoryManager = HistoryManager;
window.SnapshotManager = SnapshotManager;
window.AddSegmentCommand = AddSegmentCommand;
window.DeleteSegmentCommand = DeleteSegmentCommand;
window.EditSegmentCommand = EditSegmentCommand;
window.MoveSegmentCommand = MoveSegmentCommand;
window.BatchImportCommand = BatchImportCommand;
