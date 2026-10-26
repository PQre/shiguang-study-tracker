"""Build a self-contained GitHub Pages demo from the existing frontend."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".site"
FRONTEND = ROOT / "frontend"


def build():
    OUTPUT.mkdir(exist_ok=True)
    (OUTPUT / "static").mkdir(exist_ok=True)
    for relative in ["styles.css", "lessons.json", "vendor/vue.global.prod.js", "vendor/Vue-LICENSE.txt"]:
        destination = OUTPUT / "static" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(FRONTEND / relative, destination)

    app = (FRONTEND / "app.js").read_text(encoding="utf-8")
    app = app.replace("'/api", "'./api")
    (OUTPUT / "static/app.js").write_text(app, encoding="utf-8")
    for name in ["browser-api.js", "demo.css"]:
        shutil.copyfile(ROOT / "demo" / name, OUTPUT / "static" / name)

    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    html = html.replace('href="/static/', 'href="./static/').replace('src="/static/', 'src="./static/')
    html = html.replace("'/api", "'./api")
    html = html.replace("<title>拾光 · 学习打卡追踪器</title>", "<title>拾光 · 在线演示</title>")
    html = html.replace("</head>", '<meta name="description" content="拾光学习打卡追踪器在线演示：学习计划、打卡统计、知识点分享与导出。"><link rel="stylesheet" href="./static/demo.css"></head>')
    html = html.replace("<body>", '<body><div class="online-demo"><span><strong>在线演示</strong> 示例数据可自由操作，仅保存在当前浏览器，与 APK 数据独立。</span><div><a href="https://github.com/PQre/shiguang-study-tracker" target="_blank" rel="noopener">项目源码 ↗</a><button id="reset-demo" type="button">重置示例</button></div></div>')
    html = html.replace("数据保存在当前服务", "数据保存在当前浏览器")
    html = html.replace("演示示例 · 当前展示的是独立示例数据，不是本人学习或考核证据。", "体验提示：可以新建计划、记录今天的学习，并尝试导出图片和 CSV。")
    html = html.replace('<script src="./static/app.js"></script>', '<script src="./static/browser-api.js"></script><script src="./static/app.js"></script>')
    (OUTPUT / "index.html").write_text(html, encoding="utf-8")
    (OUTPUT / ".nojekyll").write_text("", encoding="utf-8")
    print("Built GitHub Pages demo in .site/")


if __name__ == "__main__":
    build()
