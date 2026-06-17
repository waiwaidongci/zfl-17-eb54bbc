#!/usr/bin/env python3
# ============================================================
#  胶片分镜条核对台 - 静态服务启动脚本 (Python 版)
#  用法：python3 scripts/start-server.py [端口号]
#  默认端口：8000
# ============================================================

import sys
import os
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler

DEFAULT_PORT = 8000
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"  ❌ 无效的端口号: {sys.argv[1]}")
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
