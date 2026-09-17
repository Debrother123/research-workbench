# 让 AI 安装并运行 Research Workbench

把下面这段提示词复制给你的 AI 助手即可：

```text
请帮我安装并运行这个本地项目：
https://github.com/Debrother123/research-workbench

要求：
1. 检查本机是否有 Python 3.9+；优先使用 python3，其次尝试 python，Windows 可尝试 py -3。
2. 克隆仓库并进入 research-workbench 目录。
3. 运行 `python -m unittest discover -s tests -v`，确保测试通过；Windows 若因符号链接权限跳过一项测试，明确报告，不要伪造通过。
4. 运行 `python assistant.py verify demo-workspace/projects/b32e5244-c083-4ade-9b11-dc386ab17901`，确认输出 valid。
5. 启动 `python server.py --workspace demo-workspace --port 8765 --open`，然后检查 http://127.0.0.1:8765/api/health 返回 200。
6. 在浏览器中打开 http://127.0.0.1:8765，并确认能看到 PerturbationBaselines2 演示项目。
7. 不要执行 demo 中的论文作者代码，不要上传代码或笔记，不要连接训练服务器。
8. 如果我需要整理自己的论文，请新建一个独立 workspace，例如 `python server.py --workspace my-workspace --open`，不要污染 demo-workspace。
9. 如果需要外部助手参与模块拆解，读取 `skills/research-module-sync/SKILL.md` 和 `references/workflow.md`，按其中的审计、checkpoint、attest 和 verify 流程工作。
10. 最后报告：安装位置、启动命令、服务地址、测试结果、verify 结果和遇到的阻塞。
```

## 给 Codex 用户

仓库根目录包含 `AGENTS.md`。Codex 打开仓库后会读取其中的项目边界和验证要求。

可选安装 `research-module-sync` skill：

```bash
python install_skill.py
```

## 没有 Python 时

使用 Docker：

```bash
docker compose up --build
```

然后打开 `http://127.0.0.1:8765`。