// ============================================================
//  BatchImport — 批量导入模块
//  模块边界：Parser | Validator | CodeGenerator | PreviewRenderer | Controller
//  保持 CSV 粘贴、文件上传、预览、重复检测、选择有效行和撤销导入行为不变，
//  只降低解析、校验、预览渲染和确认导入之间的耦合。
// ============================================================

(function (global) {
  "use strict";

  // ----------------------------------------------------------
  //  1. Parser — 纯函数：CSV 文本 → 行对象数组
  // ----------------------------------------------------------
  const HEADER_FIELDS = ["片段编号", "秒数", "颜色偏移", "破损情况", "备注"];

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
      const isHeaderRow = HEADER_FIELDS.every(
        (field, index) => normalizedFields[index] === field.toLowerCase()
      );
      if (isHeaderRow) continue;
      if (fields.length === 5 || fields.length === 4) {
        rows.push({ lineNum: i + 1, raw, fields });
      } else {
        rows.push({
          lineNum: i + 1,
          raw,
          fields,
          parseError: "列数不符（需4或5列）"
        });
      }
    }
    return rows;
  }

  // ----------------------------------------------------------
  //  2. Validator — 纯函数：行对象 → 校验后带状态的行数组
  // ----------------------------------------------------------
  const VALID_SHIFTS = ["正常", "偏红", "偏青", "偏黄", "褪色"];
  const VALID_DAMAGES = ["完好", "轻微划痕", "齿孔破损", "接片松动", "需跳过"];

  function validateImportRows(rows, existingCodes = []) {
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
      if (
        !/^\d+$/.test(trimmedDuration) ||
        durationNum <= 0 ||
        !Number.isFinite(durationNum)
      ) {
        errors.push("非法时长（需为正整数）");
      }

      if (trimmedShift && !VALID_SHIFTS.includes(trimmedShift)) {
        errors.push(`颜色偏移「${trimmedShift}」不在可选值中`);
      }

      if (trimmedDamage && !VALID_DAMAGES.includes(trimmedDamage)) {
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

  // ----------------------------------------------------------
  //  3. CodeGenerator — 纯函数：生成不重复的片段编号
  // ----------------------------------------------------------
  function generateUniqueCode(baseCode, existingCodesSet, selectedCodes, selfIdx) {
    if (
      !existingCodesSet.has(baseCode) &&
      !selectedCodes.some((c, i) => c === baseCode && i !== selfIdx)
    ) {
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

  // ----------------------------------------------------------
  //  4. PreviewRenderer — DOM 渲染：校验数据 → UI 更新
  // ----------------------------------------------------------
  function renderImportPreview(validated, els, context) {
    const { getActiveReel, escapeHtml, onRowCheckChange, selectAllState } = context;

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
        if (typeof onRowCheckChange === "function") {
          onRowCheckChange(idx, e.target.checked);
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

  // ----------------------------------------------------------
  //  5. Controller — BatchImportManager：持有状态、协调流程、事件绑定
  // ----------------------------------------------------------
  class BatchImportManager {
    constructor(deps) {
      this.els = deps.els;
      this.deps = deps;
      this._parsedRows = [];
      this._bindEvents();
    }

    // ---- 状态访问 ----
    getParsedRows() {
      return this._parsedRows;
    }

    setParsedRows(rows) {
      this._parsedRows = rows;
    }

    // ---- 模态框控制 ----
    openModal() {
      const { els } = this;
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
      this._parsedRows = [];
    }

    closeModal() {
      const { els } = this;
      els.importModal.classList.remove("open");
      els.importModalBackdrop.classList.remove("open");
      els.importModal.setAttribute("aria-hidden", "true");
      this._parsedRows = [];
    }

    // ---- 解析流程 ----
    handleParse() {
      const { els } = this;
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
        const self = this;
        reader.onload = () => {
          text = reader.result;
          els.importCsvText.value = text;
          self._doParseAndPreview(text);
        };
        reader.onerror = () => {
          els.importErrors.innerHTML = `<h4>⚠ 文件读取失败</h4>`;
          els.importErrors.style.display = "block";
        };
        reader.readAsText(file, "UTF-8");
      } else {
        this._doParseAndPreview(text);
      }
    }

    _doParseAndPreview(text) {
      const rows = parseCsvText(text);
      if (rows.length === 0) {
        this.els.importErrors.innerHTML = `<h4>⚠ 未解析到有效行</h4><ul><li>请确认 CSV 每行至少4列：片段编号, 秒数, 颜色偏移, 破损情况</li></ul>`;
        this.els.importErrors.style.display = "block";
        this.els.importPreviewWrap.style.display = "none";
        return;
      }
      const existingCodes = this._getExistingCodes();
      const { validated } = validateImportRows(rows, existingCodes);
      this._parsedRows = validated;
      this._renderPreview();
    }

    _getExistingCodes() {
      const reel = this.deps.getActiveReel();
      return reel ? reel.segments.map((s) => s.code) : [];
    }

    // ---- 渲染 ----
    _renderPreview() {
      const self = this;
      renderImportPreview(this._parsedRows, this.els, {
        getActiveReel: this.deps.getActiveReel,
        escapeHtml: this.deps.escapeHtml,
        onRowCheckChange: (idx, checked) => {
          if (idx >= 0 && idx < self._parsedRows.length) {
            self._parsedRows[idx].selected = checked;
            self._renderPreview();
          }
        }
      });
    }

    handleSelectAll(checked) {
      for (const row of this._parsedRows) {
        if (row.selectable) {
          row.selected = checked;
        }
      }
      if (this._parsedRows.length > 0) {
        this._renderPreview();
      }
    }

    handleFileAutoFill() {
      const file = this.els.importCsvFile.files[0];
      if (file && !this.els.importCsvText.value.trim()) {
        const reader = new FileReader();
        reader.onload = () => {
          this.els.importCsvText.value = reader.result;
        };
        reader.readAsText(file, "UTF-8");
      }
    }

    // ---- 确认导入 ----
    handleConfirm() {
      const reel = this.deps.getActiveReel();
      if (!reel) return;

      const selectedRows = this._parsedRows.filter((r) => r.selected && r.selectable);
      if (selectedRows.length === 0) return;

      const hasDup = selectedRows.some((r) => r.status === "dup");
      const confirmMsg = `确认将 ${selectedRows.length} 条选中片段导入当前放映清单「${reel.title}」？${hasDup ? "重复行将自动分配新编号。" : ""}可使用撤销恢复。`;
      if (!this.deps.confirmDialog(confirmMsg)) return;

      this.deps.beforeImport();

      const existingCodesSet = new Set(reel.segments.map((s) => s.code));
      const newCodes = [];
      const newSegments = selectedRows.map((row, idx) => {
        let finalCode = row.code;
        if (row.status === "dup") {
          finalCode = generateUniqueCode(row.code, existingCodesSet, newCodes, idx);
        }
        newCodes.push(finalCode);
        return {
          id: this.deps.generateId(),
          code: finalCode,
          duration: row._durationNum,
          shift: row.shift,
          damage: row.damage,
          note: row.note,
          thumb: ""
        };
      });

      this.deps.commitImport(reel.id, newSegments, reel.segments.length);
      this.closeModal();
    }

    // ---- 事件绑定 ----
    _bindEvents() {
      const { els } = this;
      const self = this;

      els.importBtn?.addEventListener("click", () => self.openModal());
      els.importModalClose?.addEventListener("click", () => self.closeModal());
      els.importModalBackdrop?.addEventListener("click", () => self.closeModal());
      els.importCancelBtn?.addEventListener("click", () => self.closeModal());
      els.importParseBtn?.addEventListener("click", () => self.handleParse());
      els.importConfirmBtn?.addEventListener("click", () => self.handleConfirm());

      els.importSelectAll?.addEventListener("change", (e) => {
        self.handleSelectAll(e.target.checked);
      });

      els.importCsvFile?.addEventListener("change", () => {
        self.handleFileAutoFill();
      });
    }

    // ---- Escape 键处理（供外部调用以保持一致性） ----
    isModalOpen() {
      return this.els.importModal?.classList.contains("open");
    }
  }

  // ----------------------------------------------------------
  //  导出 API
  // ----------------------------------------------------------
  global.BatchImport = {
    HEADER_FIELDS,
    VALID_SHIFTS,
    VALID_DAMAGES,
    parseCsvLine,
    parseCsvText,
    validateImportRows,
    generateUniqueCode,
    renderImportPreview,
    BatchImportManager
  };
})(window);
