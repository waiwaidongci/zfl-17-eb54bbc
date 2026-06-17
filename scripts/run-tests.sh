#!/usr/bin/env bash
# ============================================================
#  胶片分镜条核对台 - 统一测试运行入口 (Shell 版)
#  用法：bash scripts/run-tests.sh [--no-server] [--port 8000]
#
#  功能：
#    1. 运行基础自动化检查（verify-basics.py）
#    2. 启动静态文件服务器（可选）
#    3. 显示测试页面访问地址
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

NO_SERVER=false
PORT=8000
OPEN_BROWSER=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-server)
            NO_SERVER=true
            shift
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --open)
            OPEN_BROWSER=true
            shift
            ;;
        *)
            echo "未知参数: $1"
            echo "用法: bash scripts/run-tests.sh [--no-server] [--port 8000] [--open]"
            exit 1
            ;;
    esac
done

PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ 未找到 Python，请先安装 Python 3"
    exit 1
fi

echo
echo "╔══════════════════════════════════════════════════════╗"
echo "║          🎬 胶片分镜条核对台 - 回归测试           ║"
echo "╚══════════════════════════════════════════════════════╝"

echo
echo "========================================================"
echo "  🔍 第 1 步：运行基础自动化检查"
echo "========================================================"

BASICS_PASSED=true
"$PYTHON_CMD" "$SCRIPT_DIR/verify-basics.py" || BASICS_PASSED=false

if [ "$BASICS_PASSED" = true ]; then
    echo
    echo "  ✅ 基础检查全部通过"
else
    echo
    echo "  ❌ 基础检查存在失败项"
fi

if [ "$NO_SERVER" = true ]; then
    echo
    echo "========================================================"
    echo "  🏁 基础检查完成（未启动服务器）"
    echo "========================================================"
    if [ "$BASICS_PASSED" = true ]; then
        exit 0
    else
        exit 1
    fi
fi

echo
echo "========================================================"
echo "  🌐 第 2 步：启动静态文件服务器 (端口 $PORT)"
echo "========================================================"

SERVER_PID=""

cleanup() {
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        echo
        echo "  👋 正在停止服务器..."
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
        echo "  ✅ 服务器已停止"
    fi
    exit 0
}

trap cleanup INT TERM

"$PYTHON_CMD" "$SCRIPT_DIR/start-server.py" --port "$PORT" &
SERVER_PID=$!

sleep 1.5

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "  ❌ 服务器启动失败"
    exit 1
fi

echo "  ✅ 静态服务器已启动 (PID: $SERVER_PID)"

echo
echo "========================================================"
echo "  📋 测试页面访问地址"
echo "========================================================"

echo "  • 主应用              http://localhost:$PORT/index.html"
echo "  • 端到端回归测试      http://localhost:$PORT/e2e.test.html"
echo "  • 风险规则单元测试    http://localhost:$PORT/risk-rules.test.html"

echo
echo "  💡 提示："
echo "     - e2e.test.html：完整的端到端回归测试（推荐）"
echo "     - risk-rules.test.html：风险规则单元测试"
echo "     - 在浏览器中打开测试页面即可自动运行"
echo

if [ "$OPEN_BROWSER" = true ]; then
    E2E_URL="http://localhost:$PORT/e2e.test.html"
    echo "  🌐 正在打开 E2E 测试页面..."
    if command -v open &> /dev/null; then
        open "$E2E_URL"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$E2E_URL"
    fi
fi

echo "========================================================"
echo "  ⏸️  服务器运行中，按 Ctrl+C 停止"
echo "========================================================"
echo

wait "$SERVER_PID"
