# AGENTS.md

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

- 会修改本仓库目录之外文件的命令。

- 会更改提交、暂存区或工作区文件的 git 命令（如 `git add`、`git commit`、`git push`、`git pull`、`git checkout`、`git reset` 等），只读命令（如 `git status`、`git diff`、`git log` 等）可以直接运行。

- 会修改被 `.gitignore` 忽略文件（如 `node_modules`、`dist` 内的文件）的命令。

- 会改动 lockfile 的包管理命令：
  - `pnpm add` / `pnpm remove` / `pnpm update` / `pnpm install`（会改动 `pnpm-lock.yaml`）

  - `cargo add` / `cargo remove` / `cargo update`（会改动 `Cargo.lock`）

## 语言

- 代码、注释、git commit message 使用英文，文档、直接面向用户展示的 UI 文案使用中文。

- 聊天回复等其他输出使用用户所用的语言，除非用户有明确的语言偏好。

- 本地化文件使用对应语言。

- 在自然语言中，标点符号的使用要符合对应语言的书写习惯，不应生搬硬套，比如分号在现代英文写作中并不常见。

## 知识库

- 优先参考官方文档与源代码，其次才使用自身知识。

- 本地已有代码或文档时直接使用；本地没有相关资料或需要最新信息时联网查询。

## 代码风格

- 换行符使用 `LF`。

- 样式优先使用 Tailwind CSS 工具类，避免内联 `style` 与 `<style>` 块，确有需要时才编写自定义 CSS。

- UI 元素优先使用 Nuxt UI 组件，Nuxt UI 没有对应组件的原生标签（如布局用的 `div`、`span` 等）直接使用。
