#!/usr/bin/env python3
# ============================================================
#  胶片分镜条核对台 - 静态服务启动脚本 (Python 版)
#  用法：
#    python3 scripts/start-server.py [端口号]
#    python3 scripts/start-server.py --port 8080
#  默认端口：8000
# ============================================================

import sys
import os
import argparse
from http.server import HTTPServer, SimpleHTTPRequestHandler

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

DEFAULT_PORT = 8000
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))


def main():
    parser = argparse.ArgumentParser(description="胶片分镜条核对台 - 静态文件服务器")
    parser.add_argument("port_positional", type=int, nargs="?", help="端口号（位置参数）")
    parser.add_argument("--port", "-p", type=int, help="端口号（命名参数）")
    args = parser.parse_args()

    port = args.port or args.port_positional or DEFAULT_PORT
    try:
        port = int(port)
    except (TypeError, ValueError):
        print(f"  ❌ 无效的端口号: {port}")
        sys.exit(1)

    os.chdir(PROJECT_DIR)

    print("=" * 50)
    print("  🎞️  胶片分镜条核对台 - 静态服务")
    print("=" * 50)
    print()
    print(f"  项目目录: {PROJECT_DIR}")
    print(f"  端口:     {port}")
    print()
    print("  应用地址:    " + f"http://localhost:{port}/index.html")
    print("  风险规则测试: " + f"http://localhost:{port}/risk-rules.test.html")
    print("  端到端测试:   " + f"http://localhost:{port}/e2e.test.html")
    print()
    print("  按 Ctrl+C 停止服务")
    print("=" * 50)
    print()

    try:
        server = HTTPServer(("0.0.0.0", port), SimpleHTTPRequestHandler)
    except OSError as e:
        print(f"  ❌ 端口 {port} 被占用: {e}")
        print(f"     请使用其他端口: python3 scripts/start-server.py 8080")
        sys.exit(1)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
        print("  服务已停止")
        server.shutdown()


if __name__ == "__main__":
    main()
