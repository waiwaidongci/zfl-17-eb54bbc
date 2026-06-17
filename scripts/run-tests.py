#!/usr/bin/env python3
# ============================================================
#  胶片分镜条核对台 - 统一测试运行入口
#  用法：python3 scripts/run-tests.py [--no-server] [--port 8000]
#
#  功能：
#    1. 运行基础自动化检查（verify-basics.py）
#    2. 启动静态文件服务器（可选）
#    3. 显示测试页面访问地址
# ============================================================

import os
import sys
import subprocess
import argparse
import webbrowser
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent


def run_basics_check():
    """运行基础自动化检查"""
    print("=" * 56)
    print("  🔍 第 1 步：运行基础自动化检查")
    print("=" * 56)

    verify_script = SCRIPT_DIR / "verify-basics.py"
    if not verify_script.exists():
        print(f"  ❌ 找不到检查脚本: {verify_script}")
        return False

    try:
        result = subprocess.run(
            [sys.executable, str(verify_script)],
            cwd=str(PROJECT_DIR),
            capture_output=False,
        )
        if result.returncode == 0:
            print("\n  ✅ 基础检查全部通过")
            return True
        else:
            print("\n  ❌ 基础检查存在失败项")
            return False
    except Exception as e:
        print(f"  ❌ 运行检查脚本出错: {e}")
        return False


def start_static_server(port):
    """启动静态文件服务器"""
    print("\n" + "=" * 56)
    print(f"  🌐 第 2 步：启动静态文件服务器 (端口 {port})")
    print("=" * 56)

    server_script = SCRIPT_DIR / "start-server.py"
    if not server_script.exists():
        print(f"  ❌ 找不到服务器脚本: {server_script}")
        return None

    try:
        proc = subprocess.Popen(
            [sys.executable, str(server_script), "--port", str(port)],
            cwd=str(PROJECT_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        import time
        time.sleep(1.5)

        if proc.poll() is not None:
            output = proc.stdout.read() if proc.stdout else ""
            print(f"  ❌ 服务器启动失败: {output}")
            return None

        print(f"  ✅ 静态服务器已启动 (PID: {proc.pid})")
        return proc
    except Exception as e:
        print(f"  ❌ 启动服务器出错: {e}")
        return None


def show_test_urls(port):
    """显示测试页面访问地址"""
    print("\n" + "=" * 56)
    print("  📋 测试页面访问地址")
    print("=" * 56)

    urls = [
        ("主应用", f"http://localhost:{port}/index.html"),
        ("端到端回归测试", f"http://localhost:{port}/e2e.test.html"),
        ("风险规则单元测试", f"http://localhost:{port}/risk-rules.test.html"),
    ]

    for name, url in urls:
        print(f"  • {name:<20} {url}")

    print("\n  💡 提示：")
    print("     - e2e.test.html：完整的端到端回归测试（推荐）")
    print("     - risk-rules.test.html：风险规则单元测试")
    print("     - 在浏览器中打开测试页面即可自动运行")
    print()


def main():
    parser = argparse.ArgumentParser(description="胶片分镜条核对台 - 统一测试运行入口")
    parser.add_argument("--no-server", action="store_true", help="只运行基础检查，不启动服务器")
    parser.add_argument("--port", type=int, default=8000, help="静态服务器端口（默认 8000）")
    parser.add_argument("--open", action="store_true", help="自动在浏览器中打开 E2E 测试页面")
    args = parser.parse_args()

    print()
    print("╔" + "═" * 54 + "╗")
    print("║" + " " * 10 + "🎬 胶片分镜条核对台 - 回归测试" + " " * 10 + "║")
    print("╚" + "═" * 54 + "╝")

    basics_passed = run_basics_check()

    if args.no_server:
        print("\n" + "=" * 56)
        print("  🏁 基础检查完成（未启动服务器）")
        print("=" * 56)
        sys.exit(0 if basics_passed else 1)

    server_proc = start_static_server(args.port)

    if server_proc is None:
        print("\n  ❌ 无法启动静态服务器，测试流程终止")
        sys.exit(1)

    show_test_urls(args.port)

    if args.open:
        e2e_url = f"http://localhost:{args.port}/e2e.test.html"
        print(f"  🌐 正在打开 E2E 测试页面...")
        try:
            webbrowser.open(e2e_url)
        except Exception:
            pass

    print("=" * 56)
    print("  ⏸️  服务器运行中，按 Ctrl+C 停止")
    print("=" * 56)
    print()

    try:
        server_proc.wait()
    except KeyboardInterrupt:
        print("\n\n  👋 正在停止服务器...")
        server_proc.terminate()
        try:
            server_proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server_proc.kill()
        print("  ✅ 服务器已停止")
        sys.exit(0)


if __name__ == "__main__":
    main()
