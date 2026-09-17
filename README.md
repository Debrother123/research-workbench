# 研构 · Research Workbench

把论文精读笔记和代码目录整理成可追溯、可展开的模块图。项目默认只在本机运行，作者原始代码不被修改，也不把导入代码自动执行。

![Research Workbench demo](docs/assets/demo.png)

## 快速开始

需要 Python 3.9+：

```bash
python server.py --workspace demo-workspace --open
```

打开 `http://127.0.0.1:8765`，进入 `PerturbationBaselines2` 即可查看完整示例。仓库自带的 `static/` 是预构建前端，普通使用不需要 Node.js。

也可以直接运行：

```bash
python server.py --workspace demo-workspace
```

## 一键启动

- Windows：双击 `start.bat`，或在 PowerShell 中运行 `.\start.ps1`
- macOS / Linux：运行 `./start.sh`
- 让 AI 自动安装：把 `INSTALL_WITH_AI.md` 中的提示词复制给 AI
- Docker：运行 `docker compose up --build`
## 特性

- 笔记驱动的分层模块图：从论文实验地图展开到脚本和代码锚点。
- 保留作者原始代码，研究工作副本独立存在。
- React Flow + 本地 ELK 布局，支持分组折叠、搜索定位、节点与笔记双向高亮。
- 图上只展示可追溯的代码位置；推断关系明确标记为“推断”。
- 本地文件优先，不依赖模型 API、云数据库或运行时 CDN。

## 自带示例

`demo-workspace/projects/b32e5244-c083-4ade-9b11-dc386ab17901` 展示的是 *Deep-learning-based gene perturbation effect prediction does not yet outperform simple linear baselines* 的重构版精读结果：

- 7 个按论文论证顺序组织的主模块；
- 23 个脚本模块；
- 23 个 AST 候选节点；
- 12 条有明确标签的跨章节边；
- 53/53 个笔记锚点。

对应笔记在 `demo-workspace/notes/`。上游代码采用 MIT License，版权和许可证随 `original/` 与 `working/` 一并保留。

## 目录

```text
server.py / backend.py / assistant.py   本地后端与检查工具
static/                                 预构建浏览器应用
frontend/                               React Flow 前端源码与构建脚本
skills/research-module-sync/            外部助手同步工作流
demo-workspace/                         演示项目、笔记与 MIT 上游代码
tests/                                  Python 标准库测试
docs/evidence/                         示例结构整理报告与审计图
third_party_licenses/                  第三方许可证文本
```

## 重建前端

只有修改前端源码时才需要 Node.js：

```bash
cd frontend
npm ci
node build.mjs
```

构建产物写回 `static/bundle/`。

## 测试

```bash
python -m unittest discover -s tests -v
python assistant.py verify demo-workspace/projects/b32e5244-c083-4ade-9b11-dc386ab17901
```

## 设计边界

- 静态结构不等于已核验计算流。
- 未适配的研究图导出后会标记 `needs_adaptation`。
- 本项目不声称自动复现论文训练结果，也不把作者源码替代成未经验证的实现。
- 导入代码默认不执行；需要运行时必须由用户显式发起独立适配任务。

## 许可证

应用代码采用 MIT License。第三方依赖和示例上游代码的许可证见 `THIRD_PARTY_NOTICES.md` 与 `third_party_licenses/`。
