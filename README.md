# WTFSync

WTFSync（WTF 同步器）是一款 Windows 桌面工具，用于在同一台电脑的多个《魔兽世界》账号之间共享 BGLite 金团表格的角色数据。它读取所选账号的插件存档，生成游戏插件模块 `BiaoGeAccounts`，供 BGLite 夜月扩展包的角色总览读取。你也可以直接在桌面应用里查看角色和金团账单。

## 第一次同步

Windows x64 安装包面向 Windows 10 2004（内部版本 19041）及以上版本和 Windows 11，运行时需要 Microsoft Edge WebView2。

1. 在目标游戏版本中安装并启用 BGLite。用参与同步的账号登录角色，再退出游戏，让插件将数据写入磁盘。
2. 打开 WTFSync，在「工作台」点击「选择目录」。可以选 `World of Warcraft` 安装目录，也可以直接选其中的版本目录，如 `_classic_titan_`。安装了多个版本时，在「设置」中确认当前游戏版本。
3. 回到「工作台」，勾选要共享数据的账号，点击「立即同步」。在同步详情中查看哪些账号成功、哪些文件有更新，以及失败原因。
4. 要在游戏中查看其他账号的角色，请启用生成的 `BiaoGeAccounts` 模块和夜月扩展包的角色总览（`BGLite_RoleOverview`），再进入游戏查看。

自动同步默认开启。应用启动时会同步已选账号，运行期间会在其插件存档发生变化后重新生成模块。每个游戏版本单独保存账号选择。要从模块中移除某个账号，取消勾选后点击「立即同步」即可。

## 角色、账单与本地文件

| 功能 | 读取或写入的内容 |
| --- | --- |
| 账号同步 | 从版本目录下的 `WTF/Account/<账号>/SavedVariables/BGLite.lua` 读取数据，将账号 Lua 文件、加载器和插件清单写入同一版本的 `Interface/AddOns/BiaoGeAccounts/`。普通同步只读原存档。 |
| 角色总览 | 按账号筛选或搜索角色，查看金币、装备和副本进度。要删除插件中的角色记录，请先退出游戏。确认删除后，应用会在原存档旁创建备份，再修改该账号的 `BGLite.lua`。 |
| 金团账单 | 查看当前表格、装备成交、收支和分金明细。应用检测到表格清空时，会把上次读到的账单归档；也可在账单明细中手动保存。快照和归档保存在本机应用数据目录的 `bill-history.json`。 |

同步数据保留在本机，生成的 Lua 文件为明文。反馈问题时，请隐去真实账号和角色名称。详见[隐私政策](src/assets/privacy-policy.txt)。

## 从源码运行

在 Windows 上准备 Node.js 26.x、pnpm 12.x、稳定版 Rust（MSVC 工具链）、Visual Studio C++ 生成工具、Windows SDK 和 WebView2。在仓库根目录执行以下命令。首次从源码启动桌面应用时，需要先从项目图标生成 Tauri 图标资源。

```powershell
pnpm install --frozen-lockfile
pnpm exec tauri icon public/icon.png
pnpm exec tauri dev
```

单独运行 `pnpm dev` 可以在浏览器中开发界面。选择本地目录、读取游戏存档和验证自动同步时，请使用桌面应用。

| 命令 | 用途 |
| --- | --- |
| `pnpm build` | 构建前端并检查 Vue 和 TypeScript 类型。首次构建会生成类型检查所需的声明。 |
| `pnpm exec vp check --deny-warnings` | 检查格式和代码质量。 |
| `pnpm test` | 运行 Vitest 测试。 |
| `pnpm store:sample` | 在 `artifacts/store-sample/WorldOfWarcraft` 生成虚构的游戏目录，可用它走完首次同步流程。 |
| `pnpm pack:msix` | 使用 PowerShell 7 构建 Windows x64 MSIX，默认生成未签名包。 |

包版本、签名、产物路径和手动构建工作流见 [Windows 打包说明](packaging/windows/README.md)。项目采用 [The Unlicense](LICENSE)。
