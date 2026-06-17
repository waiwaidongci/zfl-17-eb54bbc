#!/usr/bin/env bash
# ============================================================
#  胶片分镜条核对台 - 静态服务启动脚本
#  用法：./scripts/start-server.sh [端口号]
#  默认端口：8000
# ============================================================

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
PORT="${1:-8000}"

cd "$PROJECT_DIR"

echo "=============================================="
echo "  🎞️  胶片分镜条核对台 - 静态服务"
echo "=============================================="
echo ""
echo "  项目目录: $PROJECT_DIR"
echo "  端口:     $PORT"
echo ""

if command -v python3 &> /dev/null; then
  echo "  使用 Python 3 启动服务..."
  echo ""
  echo "  应用地址:    http://localhost:$PORT/index.html"
  echo "  风险规则测试: http://localhost:$PORT/risk-rules.test.html"
  echo "  端到端测试:   http://localhost:$PORT/e2e.test.html"
  echo ""
  echo "  按 Ctrl+C 停止服务"
  echo "=============================================="
  echo ""
  python3 -m http.server "$PORT"
elif command -v python &> /dev/null; then
  echo "  使用 Python 启动服务..."
  echo ""
  echo "  应用地址:    http://localhost:$PORT/index.html"
  echo "  风险规则测试: http://localhost:$PORT/risk-rules.test.html"
  echo "  端到端测试:   http://localhost:$PORT/e2e.test.html"
  echo ""
  echo "  按 Ctrl+C 停止服务"
  echo "=============================================="
  echo ""
  python -m SimpleHTTPServer "$PORT"
else
  echo "  ❌ 错误：未找到 Python，请先安装 Python 3"
  echo "  或者直接双击 index.html 用浏览器打开使用"
  exit 1
fi
