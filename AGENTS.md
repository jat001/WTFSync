# AGENTS.md

AI 编程助手的仓库级指令文件。

## 项目概览

- 基于 Tauri 2 的桌面应用：前端 TypeScript（Vue 3 + Vite + Tailwind CSS + Nuxt UI），后端 Rust。

- 包管理器为 pnpm，请勿改用 npm/yarn 等其他包管理器。

- 前端代码位于 `src/`，后端代码位于 `src-tauri/`。

## 常用命令

- `pnpm dev`：启动 Vite 前端开发服务器。

- `pnpm build`：运行类型检查并构建前端。

- `pnpm tauri dev` / `pnpm tauri build`：以桌面应用方式运行 / 构建。

- Rust 相关命令需在 `src-tauri/` 目录下通过 `cargo` 执行。

## 需要明确同意的命令

运行以下命令前必须获得用户明确同意：

- 会修改工作区外文件的命令。

- 会修改被 `.gitignore` 忽略文件（如 `node_modules`、`dist` 内的文件）的命令。

- 会产生大量难以审查的修改的包管理命令（包含但不限于以下示例）：
  - `pnpm add` / `pnpm remove`（会改动 `pnpm-lock.yaml`）

  - `cargo add` / `cargo remove`（会改动 `Cargo.lock`）

## 语言

- 代码、注释、文档、git commit message 一律使用英文（本文档除外）。

- 回复用户、思考过程可以使用用户所用的语言。

- 未做 i18n 的项目中，直接面向用户展示的本地化内容可使用原语言。

- 本地化文件使用对应语言。

## 知识库

- 优先参考官方文档与源代码，其次才使用自身知识。

- 必要时联网查询；本地已有代码或文档时直接使用。

## 代码风格

处理用户任务前，特别是**修改任何文件之前**，必须完成以下任务，**不得跳过，也不得以"任务简单"、"与任务无关"等理由跳过**：

1. **完整读取** VS Code 两种设置作用域配置文件，即工作区（workspace）与用户（user）级设置：

- 工作区：仓库根目录下的 `.vscode/settings.json`，仅作用于当前仓库。

- 用户：VS Code 的用户级（全局）设置文件 `settings.json`，作用于所有工作区。其路径因平台与安装方式（标准安装、scoop/homebrew/portable、自定义 `--user-data-dir` 等）而异，不要假设任何固定路径。可通过环境变量（如 `VSCODE_USER_PROMPTS_FOLDER` 等）推测其位置，或直接在本机搜索该文件；以实际找到的为准。

2. 每次会话开始时，必须读取上述两个配置文件（工作区 `.vscode/settings.json` 与用户级 `settings.json`）的实际内容，再基于现状回答或修改，切勿假设其内容、路径或是否已存在该配置。

3. 读取配置文件时必须覆盖其完整内容，不能只读取开头一部分；文件较长时应全文读取，并针对关键键（如 `files.eol`、`files.encoding`、`files.insertFinalNewline`、`prettier.*` 等）进行搜索，确保不遗漏任何相关设置。

4. 全部完成后，才能修改文件。
