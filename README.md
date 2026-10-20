# 拾光：学习打卡追踪器

AI 生成式软件开发训练营最终项目基础版，选题来自教材推荐清单。使用 FastAPI + Vue 3 + SQLite，支持学习计划、打卡记录、统计和知识点分享。

## 获取源码

```bash
git clone https://github.com/PQre/shiguang-study-tracker.git
cd shiguang-study-tracker
```

## 启动

安装 Python 3.11 或以上，推荐 Python 3.12。在项目目录运行：

Windows：

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python run.py
```

macOS / Linux：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python run.py
```

浏览器打开 <http://127.0.0.1:8000>。真实模式初始数据库为空。

使用独立演示库：

```powershell
.venv\Scripts\python run.py --demo
```

macOS / Linux 使用 `.venv/bin/python run.py --demo`。演示模式会生成虚构的示例数据。Windows 安装好依赖后也可运行 `启动项目.ps1`，加 `-Demo` 参数可打开演示模式。

Python 可从[官方网站](https://www.python.org/downloads/)安装。

## 测试

```powershell
.venv\Scripts\python run_tests.py
```

macOS / Linux 使用 `.venv/bin/python run_tests.py`。测试使用独立临时库，不操作 `data/tracker.db`。现有 24 项自动化测试，浏览器反馈、PNG 导出和移动布局检查记录见 [测试报告](docs/08-测试报告.md)。每次推送和提交 Pull Request 都会自动运行测试。

## 一起协作

同学可以 Fork 本仓库，在自己的功能分支上修改，再提交 Pull Request。已获仓库写入权限的同学可以直接推送功能分支。任务分工、开发流程和提交前检查见 [协作指南](CONTRIBUTING.md)。

可在 [Issues](https://github.com/PQre/shiguang-study-tracker/issues) 提出问题或认领任务。每个 Pull Request 说明改动目的、操作效果和验证方式，便于互相检查。

## 功能与文件

- 学习计划的创建、调整和删除保护。
- 每日记录、编辑、删除、统计、CSV 导出。
- 28 个教材知识点检索与分享 PNG 导出。
- Spec、架构、数据库、API、审查、提示词记录、测试、操作、部署和总结文档。

源码分为 `backend/` 与 `frontend/`，API 文档 `/openapi.json`，交互式接口页 `/docs`。
历史运行截图和交付附件保存在本地材料中，公开仓库只包含源码、测试和项目文档。文档中提到的 `evidence/` 目录不随仓库上传，测试时会在本地生成 XML 报告。
应用没有调用大模型 API，也不自动上传群公告。演示数据不代表本人经历。真实模式和演示模式使用两个独立数据库。

数据文件默认存于 `data/`。本项目为单用户版本，默认只监听本机。远程演示应使用受保护的 CloudStudio 工作空间或外层身份验证，部署步骤见文档。

Vue 版本 3.5.44，MIT 许可证保存在 `frontend/vendor/Vue-LICENSE.txt`。Vue 文件来自官方快速入门文档建议的发行地址，项目内保存后运行不依赖 CDN。
