# WTFSync 仓库协作指南

本文件适用于整个仓库。用户操作流程见 [README](README.md)，Windows 安装包的构建与签名见 [打包说明](packaging/windows/README.md)。

## 开始修改前

- 先用 `git status --short` 和 `git diff` 确认已有改动，保留用户正在进行的工作。
- 优先查阅仓库中的源代码、测试和配置。遇到缺少说明的逻辑，完整阅读实现并跟踪调用链，再判断行为。本地资料不足或需要确认上游现状时，查阅官方文档或源代码。
- 前端使用 pnpm。Node.js 和 pnpm 的版本范围以 `package.json` 的 `engines` 为准，依赖目录和覆盖规则见 `pnpm-workspace.yaml`。在仓库根目录执行 pnpm 命令，在 `src-tauri/` 下执行 Cargo 命令。

## 操作授权

执行以下命令前，须取得用户对相应操作的明确同意。只读检查（例如 `git status`、`git diff`、`git log`）可以直接执行。

- 会修改仓库以外文件的命令，包括写入真实游戏存档、插件目录或系统证书库。
- 会更改提交、暂存区或工作区的 Git 命令，例如 `git add`、`git commit`、`git checkout`、`git reset`、`git pull`，以及向远端写入的 `git push`。

## 按改动定位代码

| 改动       | 入口与职责                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 同步流程   | `src/composables/useSync.ts` 管理账号选择、启动同步和监听。`src/core/engine.ts` 串行执行同步、校验输出路径并按内容写入；游戏目录识别、账号扫描和文件监听也在 `src/core/`。                      |
| 插件数据   | `src/core/profile.ts` 定义插件接口，`src/profiles/index.ts` 注册实现。BGLite 的存档解析、角色总览、账单和角色删除在 `src/profiles/biaoge/`；游戏内加载器与清单模板在 `addons/BiaoGeAccounts/`。 |
| 界面与状态 | `src/App.vue` 组织页面，`src/pages/` 和 `src/components/` 实现界面。`src/composables/` 协调设置、同步和账单状态。                                                                               |
| 桌面集成   | `src/core/tauri-fs.ts` 对接 Tauri 文件系统。`src-tauri/src/lib.rs` 注册插件和原生命令，`src-tauri/capabilities/` 声明权限，`src-tauri/tauri.conf.json` 配置开发服务器和构建入口。               |

修改同步逻辑时，保留单账号失败时其他账号继续同步的行为。BGLite 会为读取失败的账号保留已有输出，清理账号文件时以旧插件清单为依据。普通同步只读原始 SavedVariables；角色删除是单独的写入流程，需保留界面确认和写入前备份。修改设置结构时，检查 `useSettings.ts` 中的默认值、已有配置迁移和按游戏目录区分的账号选择。

## 编码与验证

- 仓库文本使用 LF。生成给游戏的 Lua 和 TOC 遵循插件已有的输出格式。代码、注释和 Git 提交信息使用英文，文档和用户界面文案使用中文，本地化文件使用目标语言。聊天使用用户所用语言，按对应语言的习惯使用标点。
- Vue 组件优先使用 Nuxt UI，布局可直接用原生元素。样式优先使用 Tailwind CSS 工具类，确有需要时再使用自定义 CSS。
- 同步和存档测试优先复用 `tests/helpers/` 中的内存文件系统和虚构游戏数据。相关测试分别位于 `tests/core/`、`tests/profiles/` 和 `tests/composables/`。
- 在已获相应写入授权后，按 [.github/workflows/ci.yml](.github/workflows/ci.yml) 的顺序验证前端：先运行 `pnpm exec vp build` 生成自动导入声明，再运行 `pnpm exec vp check --deny-warnings`、`pnpm typecheck` 和 `pnpm test`。
- 修改 Rust 代码后，在 `src-tauri/` 中运行 `cargo test --locked`。验证目录选择和文件监听等桌面行为时，使用 README 中的 Tauri 启动命令和虚构游戏目录。
- 修改 MSIX 清单或打包脚本时，核对 `scripts/package-msix.ps1` 和 [.github/workflows/release-msix.yml](.github/workflows/release-msix.yml)。该工作流由手动触发，生成未签名的 x64 MSIX 并上传为工作流产物。
