#!/usr/bin/env python3
# ============================================================
#  胶片分镜条核对台 - 基础自动化检查脚本
#  用法：python3 scripts/verify-basics.py
#
#  检查内容：
#    1. 文件完整性（HTML/JS/CSS/CSV 等）
#    2. HTML 结构（script 标签、关键 DOM 元素）
#    3. JS 核心 API 函数存在性（静态分析）
#    4. 风险规则测试用例完整性
#    5. CSV 示例文件格式
# ============================================================

import os
import sys
import re
import json
import csv
from pathlib import Path
from html.parser import HTMLParser

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent

# 必需的文件
REQUIRED_FILES = [
    "index.html",
    "app.js",
    "risk-rules.js",
    "batch-import.js",
    "styles.css",
    "risk-rules.test.html",
    "segments-example.csv",
    "README.md",
]

# index.html 中应该存在的关键 DOM 元素 ID
REQUIRED_DOM_IDS = [
    "segmentForm",
    "codeInput",
    "durationInput",
    "shiftInput",
    "damageInput",
    "noteInput",
    "segmentList",
    "importBtn",
    "riskRulesBtn",
    "backupBtn",
    "snapshotBtn",
    "reportBtn",
    "undoBtn",
    "redoBtn",
]

# risk-rules.js 中应该暴露的核心 API
REQUIRED_RISK_APIS = [
    "calculateSegmentRisk",
    "getCurrentRiskRules",
    "updateRiskRules",
    "resetRiskRulesToDefault",
    "validateRiskRules",
    "getSerializedRulesForBackup",
    "restoreRulesFromBackup",
]

# app.js 中应该存在的核心类/函数
REQUIRED_APP_CLASSES = [
    "HistoryManager",
    "AddSegmentCommand",
    "DeleteSegmentCommand",
    "EditSegmentCommand",
    "MoveSegmentCommand",
    "BatchImportCommand",
    "SnapshotManager",
]

# batch-import.js 中应该暴露的 API
REQUIRED_BATCH_APIS = [
    "parseCsvText",
    "validateImportRows",
    "generateUniqueCode",
    "BatchImportManager",
]


class HtmlTagParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.stylesheets = []
        self.element_ids = []
        self.in_script = False
        self.current_script_src = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == "script":
            src = attrs_dict.get("src", "")
            if src:
                self.scripts.append(src)
            else:
                self.in_script = True
        elif tag == "link" and attrs_dict.get("rel") == "stylesheet":
            self.stylesheets.append(attrs_dict.get("href", ""))
        if "id" in attrs_dict:
            self.element_ids.append(attrs_dict["id"])

    def handle_endtag(self, tag):
        if tag == "script":
            self.in_script = False


def check_file_integrity():
    """检查必需文件是否存在"""
    results = []
    all_pass = True

    for f in REQUIRED_FILES:
        path = PROJECT_DIR / f
        exists = path.exists()
        size = path.stat().st_size if exists else 0
        results.append({
            "name": f,
            "pass": exists and size > 0,
            "detail": f"{size} 字节" if exists else "文件不存在",
        })
        if not exists or size == 0:
            all_pass = False

    return all_pass, results


def check_html_structure():
    """检查 HTML 文件结构"""
    results = []
    all_pass = True

    index_path = PROJECT_DIR / "index.html"
    if not index_path.exists():
        return False, [{"name": "index.html", "pass": False, "detail": "文件不存在"}]

    with open(index_path, "r", encoding="utf-8") as f:
        content = f.read()

    parser = HtmlTagParser()
    parser.feed(content)

    # 检查 script 标签
    expected_scripts = ["risk-rules.js", "batch-import.js", "app.js"]
    for s in expected_scripts:
        found = s in parser.scripts
        results.append({
            "name": f"script 引用: {s}",
            "pass": found,
            "detail": "找到" if found else "未找到",
        })
        if not found:
            all_pass = False

    # 检查 CSS 引用
    if "styles.css" in parser.stylesheets:
        results.append({"name": "stylesheet 引用: styles.css", "pass": True, "detail": "找到"})
    else:
        results.append({"name": "stylesheet 引用: styles.css", "pass": False, "detail": "未找到"})
        all_pass = False

    # 检查关键 DOM 元素
    dom_set = set(parser.element_ids)
    for dom_id in REQUIRED_DOM_IDS:
        found = dom_id in dom_set
        results.append({
            "name": f"DOM 元素: #{dom_id}",
            "pass": found,
            "detail": "找到" if found else "未找到",
        })
        if not found:
            all_pass = False

    return all_pass, results


def check_js_apis():
    """静态分析 JS 文件，检查核心 API 是否存在"""
    results = []
    all_pass = True

    # 检查 risk-rules.js
    risk_path = PROJECT_DIR / "risk-rules.js"
    if risk_path.exists():
        with open(risk_path, "r", encoding="utf-8") as f:
            content = f.read()

        for api in REQUIRED_RISK_APIS:
            # 检查函数定义或 window.xxx 赋值
            pattern = rf"(function\s+{re.escape(api)}\s*\(|window\.{re.escape(api)}\s*=)"
            found = bool(re.search(pattern, content))
            results.append({
                "name": f"风险规则 API: {api}",
                "pass": found,
                "detail": "找到" if found else "未找到",
            })
            if not found:
                all_pass = False
    else:
        results.append({"name": "risk-rules.js", "pass": False, "detail": "文件不存在"})
        all_pass = False

    # 检查 app.js
    app_path = PROJECT_DIR / "app.js"
    if app_path.exists():
        with open(app_path, "r", encoding="utf-8") as f:
            content = f.read()

        for cls in REQUIRED_APP_CLASSES:
            pattern = rf"class\s+{re.escape(cls)}\s+"
            found = bool(re.search(pattern, content))
            results.append({
                "name": f"应用类: {cls}",
                "pass": found,
                "detail": "找到" if found else "未找到",
            })
            if not found:
                all_pass = False
    else:
        results.append({"name": "app.js", "pass": False, "detail": "文件不存在"})
        all_pass = False

    # 检查 batch-import.js
    batch_path = PROJECT_DIR / "batch-import.js"
    if batch_path.exists():
        with open(batch_path, "r", encoding="utf-8") as f:
            content = f.read()

        for api in REQUIRED_BATCH_APIS:
            pattern = rf"(function\s+{re.escape(api)}\s*\(|class\s+{re.escape(api)}\s+|{re.escape(api)}\s*[:,])"
            found = bool(re.search(pattern, content))
            results.append({
                "name": f"批量导入 API: {api}",
                "pass": found,
                "detail": "找到" if found else "未找到",
            })
            if not found:
                all_pass = False
    else:
        results.append({"name": "batch-import.js", "pass": False, "detail": "文件不存在"})
        all_pass = False

    return all_pass, results


def check_test_cases():
    """检查风险规则测试文件的完整性"""
    results = []
    all_pass = True

    test_path = PROJECT_DIR / "risk-rules.test.html"
    if not test_path.exists():
        return False, [{"name": "risk-rules.test.html", "pass": False, "detail": "文件不存在"}]

    with open(test_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 检查测试框架是否存在
    framework_items = ["describe", "it", "assert", "beforeEach", "afterEach"]
    for item in framework_items:
        # 函数声明或 const xxx = / window.xxx = 形式
        pattern = rf"(function\s+{re.escape(item)}\s*\(|const\s+{re.escape(item)}\s*=|window\.{re.escape(item)}\s*=)"
        found = bool(re.search(pattern, content))
        results.append({
            "name": f"测试框架: {item}",
            "pass": found,
            "detail": "找到" if found else "未找到",
        })
        if not found:
            all_pass = False

    # 统计 describe 块的数量
    describe_count = len(re.findall(r'describe\(["\']', content))
    it_count = len(re.findall(r'it\(["\']', content))
    results.append({
        "name": "测试套件数量",
        "pass": describe_count >= 5,
        "detail": f"{describe_count} 个套件",
    })
    results.append({
        "name": "测试用例数量",
        "pass": it_count >= 20,
        "detail": f"{it_count} 个用例",
    })
    if describe_count < 5 or it_count < 20:
        all_pass = False

    # 检查 localStorage 隔离
    has_isolation = "__test_zfl17_" in content
    results.append({
        "name": "测试 localStorage 隔离",
        "pass": has_isolation,
        "detail": "有" if has_isolation else "无",
    })
    if not has_isolation:
        all_pass = False

    return all_pass, results


def check_csv_example():
    """检查 CSV 示例文件格式"""
    results = []
    all_pass = True

    csv_path = PROJECT_DIR / "segments-example.csv"
    if not csv_path.exists():
        return False, [{"name": "segments-example.csv", "pass": False, "detail": "文件不存在"}]

    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            rows = list(reader)

        if len(rows) < 2:
            results.append({"name": "CSV 行数", "pass": False, "detail": f"仅 {len(rows)} 行，至少需要表头+1条数据"})
            all_pass = False
        else:
            results.append({"name": "CSV 行数", "pass": True, "detail": f"{len(rows)} 行（含表头）"})

        # 检查表头
        header = rows[0]
        expected_header = ["片段编号", "秒数", "颜色偏移", "破损情况", "备注"]
        if len(header) >= 4:
            match = all(h.strip() == e for h, e in zip(header[:4], expected_header[:4]))
            results.append({
                "name": "CSV 表头格式",
                "pass": match,
                "detail": "正确" if match else f"实际: {header[:len(expected_header)]}",
            })
            if not match:
                all_pass = False
        else:
            results.append({"name": "CSV 表头格式", "pass": False, "detail": "列数不足"})
            all_pass = False

        # 检查数据行
        valid_shifts = {"正常", "偏红", "偏青", "偏黄", "褪色"}
        valid_damages = {"完好", "轻微划痕", "齿孔破损", "接片松动", "需跳过"}

        data_rows = rows[1:] if len(rows) > 1 else []
        valid_count = 0
        for i, row in enumerate(data_rows):
            if len(row) >= 4:
                shift = row[2].strip()
                damage = row[3].strip()
                if shift in valid_shifts and damage in valid_damages:
                    try:
                        duration = int(row[1].strip())
                        if duration > 0:
                            valid_count += 1
                    except ValueError:
                        pass

        results.append({
            "name": "CSV 有效数据行",
            "pass": valid_count >= 3,
            "detail": f"{valid_count} 行有效数据",
        })
        if valid_count < 3:
            all_pass = False

    except Exception as e:
        results.append({"name": "CSV 解析", "pass": False, "detail": f"解析错误: {e}"})
        all_pass = False

    return all_pass, results


def print_section(title, results, all_pass):
    """打印一个检查区块的结果"""
    status = "✅ 通过" if all_pass else "❌ 失败"
    print(f"\n  [{status}] {title}")
    print(f"  {'─' * 50}")

    for r in results:
        mark = "  ✓" if r["pass"] else "  ✗"
        detail = r["detail"]
        print(f"  {mark} {r['name']:<40} {detail}")


def main():
    print("=" * 56)
    print("  🔍 胶片分镜条核对台 - 基础自动化检查")
    print("=" * 56)

    all_results = []

    # 1. 文件完整性检查
    pass1, res1 = check_file_integrity()
    all_results.append(("文件完整性", pass1, res1))

    # 2. HTML 结构检查
    pass2, res2 = check_html_structure()
    all_results.append(("HTML 结构", pass2, res2))

    # 3. JS 核心 API 检查
    pass3, res3 = check_js_apis()
    all_results.append(("JS 核心 API", pass3, res3))

    # 4. 测试用例完整性检查
    pass4, res4 = check_test_cases()
    all_results.append(("测试用例完整性", pass4, res4))

    # 5. CSV 示例检查
    pass5, res5 = check_csv_example()
    all_results.append(("CSV 示例格式", pass5, res5))

    # 打印所有结果
    for title, passed, results in all_results:
        print_section(title, results, passed)

    # 汇总
    total_pass = sum(1 for _, p, _ in all_results if p)
    total = len(all_results)

    print("\n" + "=" * 56)
    if total_pass == total:
        print(f"  ✅ 全部 {total} 项检查通过")
    else:
        print(f"  ❌ {total_pass}/{total} 项检查通过，{total - total_pass} 项失败")
    print("=" * 56)

    # 返回退出码
    sys.exit(0 if total_pass == total else 1)


if __name__ == "__main__":
    main()
