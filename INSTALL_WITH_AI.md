# 让 AI 安装并使用 Research Workbench

把下面这段提示词复制给你的 AI 助手：

```text
请帮我安装、验证并开始使用这个本地项目：
https://github.com/Debrother123/research-workbench

重要背景：
这个工作台目前不是完全自动化的。私人笔记不需要上传到 GitHub；浏览 demo 不需要额外笔记，导入自己的代码时 `note_path` 也可以留空，先生成“仅代码候选图”。但要按论文/笔记逻辑组织模块、映射代码、适配研究图并完成证据核验，必须使用仓库内的 research-module-sync skill。

执行要求：
1. 检查本机是否有 Python 3.9+；优先使用 python3，其次尝试 python，Windows 可尝试 py -3。
2. 克隆仓库并进入 research-workbench 目录。
3. 运行 `python install_skill.py`，把 `skills/research-module-sync` 安装到本机 Codex skills 目录。若目标已存在，不要覆盖，报告路径并让我决定。
4. 读取并遵守：
   - `skills/research-module-sync/SKILL.md`
   - `skills/research-module-sync/references/workflow.md`
5. 运行 `python -m unittest discover -s tests -v`；Windows 若因符号链接权限跳过一项测试，要明确报告，不要伪造通过。
6. 运行 `python assistant.py verify demo-workspace/projects/b32e5244-c083-4ade-9b11-dc386ab17901`，确认输出 valid。
7. 启动 `python server.py --workspace demo-workspace --port 8765 --open`，检查 http://127.0.0.1:8765/api/health 返回 200。
8. 在浏览器打开 http://127.0.0.1:8765，确认能看到 PerturbationBaselines2 演示项目。
9. 不要执行 demo 中的论文作者代码，不要上传代码或笔记，不要连接训练服务器。
10. 如果我需要整理自己的论文，请使用默认个人 workspace：`python server.py --workspace workspace --open`。`workspace/` 已在 `.gitignore` 中，个人项目不要写入 `demo-workspace`；也可以改成仓库外的绝对路径。我可以先只导入代码；如果提供本地笔记，再按 skill 的 checkpoint → apply-graph → attest → verify 流程补上笔记锚定和语义核验，不要只停在 AST 候选阶段。
11. 最后报告：skill 安装路径、测试结果、verify 结果、服务地址、演示项目是否可见，以及阻塞项。
```

## 为什么 skill 是必需的

没有 `research-module-sync` 时：

- 只能浏览导入后的 AST 候选；
- 不能自动按精读笔记的论证逻辑重组模块；
- 不能可靠绑定代码位置、证据边界和笔记锚点；
- 不能完成受控的 checkpoint、apply-graph、attest 和 verify。

有 skill 后，外部 AI 才能在工作台的文件契约下完成：

```text
checkpoint → 审查代码与笔记 → 更新 working/ 与图
→ 写证据报告 → apply-graph → attest → verify
```

## 非 Codex 用户

直接把以下文件交给 AI：

- `skills/research-module-sync/SKILL.md`
- `skills/research-module-sync/references/workflow.md`
- `CONTRACT.md`
- `AGENTS.md`

让它先阅读这些文件，再操作工作台的 `demo-workspace` 或独立 workspace。

## Docker

没有 Python 时：

```bash
docker compose up --build
```

然后打开 `http://127.0.0.1:8765`。完整 AI 辅助流程仍然建议安装或读取上述 skill。