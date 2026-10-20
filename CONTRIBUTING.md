# 协作指南

欢迎同学一起完善拾光学习打卡追踪器。先按 [README](README.md) 启动项目，再认领一个范围清楚的任务。

## 认领任务

在 Issues 写明需要改善的地方、预期结果和验证方法。开始前留言认领，避免多人同时修改同一部分。前端页面在 `frontend/`，接口和数据逻辑在 `backend/`，自动化测试在 `tests/`，设计与操作文档在 `docs/`。

## 提交修改

没有写入权限的同学：

1. 点击 GitHub 上的 Fork，将仓库复制到自己的账号。
2. 克隆自己的仓库，在功能分支上开发，例如 `feat/lesson-search` 或 `fix/mobile-layout`。
3. 提交并推送到自己的仓库，向 `PQre/shiguang-study-tracker` 的 `main` 分支发起 Pull Request。

已获写入权限的同学：

```bash
git switch main
git pull --ff-only
git switch -c feat/lesson-search
# 完成修改并检查后，将文件路径替换为本次实际修改的文件
git add frontend/app.js
git commit -m "改进知识点搜索"
git push -u origin feat/lesson-search
```

随后在 GitHub 创建 Pull Request，目标分支选 `main`。每个分支处理一个任务，审查和测试通过后再合并。

## 提交前检查

- 按 README 运行 `run_tests.py`，接口和数据行为变化时补充对应测试。
- 页面变化检查桌面和手机宽度；涉及 PNG、CSV 时实际导出一次。
- 说明更改原因、操作结果和测试方式。界面改动可附无个人信息的截图。
- 不提交姓名、邮箱、账号凭据、真实学习记录、数据库、依赖目录或原始教材文件。本地生成的这些文件已设为忽略。
- 接口或使用方式变化时同步更新相应文档。

## 当前应用范围

本项目支持同学共同开发源码，运行中的应用仍为单用户版本。每位同学在自己的电脑上使用独立数据库。多人账号、权限隔离和共享服务部署需要另行设计与测试。
