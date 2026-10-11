# Microsoft Store 发布包

本目录保存 WTFSync 的正式 MSIX 清单与图标，身份来自 Partner Center 的产品 `9NTVMTNGV9SL`。应用代码和前端技术栈保持 Tauri 2 + Vue 3。

## 构建

在 Windows x64 和 PowerShell 7 上，先安装项目依赖，再运行：

```powershell
pnpm pack:msix
```

脚本会生成 Tauri 图标、构建 release 可执行文件，并使用 winapp 生成未签名 MSIX。输出位于 `artifacts/msix/1.0.0.0/`，可上传到 Partner Center；Microsoft Store 会为发布包签名。

重新使用已构建的可执行文件时：

```powershell
pnpm pack:msix -SkipBuild
```

应用版本来自 `package.json`；MSIX 包版本独立使用四段版本，最后一段为 0。发布更新时显式提高包版本，例如：

```powershell
pnpm pack:msix -PackageVersion 1.0.1.0
```

发布工作流 `release-msix.yml` 只在手动触发时构建 artifact，不上传商店、不提交认证，也不需要商店 API 凭据。

## 本地签名测试

可生成短期开发证书，发布者必须与清单一致：

```powershell
pnpm exec winapp cert generate --manifest packaging/windows/Package.appxmanifest --output artifacts/signing/devcert.pfx --valid-days 7 --export-cer
pnpm pack:msix -SkipBuild -Certificate artifacts/signing/devcert.pfx
```

生成证书不会自动建立系统信任。安装自签名测试包前，Windows 的部署服务要求计算机级 TrustedPeople 信任，需要管理员权限和用户单独确认；仅加入当前用户证书库不足以安装。验证后应移除本次建立的证书信任。也可以在已经启用开发模式的机器上，用 winapp run 注册开发包验证包身份和运行行为，无需扩大证书信任；这不等同于正式 MSIX 安装测试。开发证书及测试签名包不得上传到商店，PFX/CER 和 artifacts 均被忽略。

## 系统与数据访问

- 包面向 Windows 10 2004（build 19041）及以上、Windows 11，架构为 x64。
- 以普通用户的 full-trust 桌面进程运行，声明 `runFullTrust`。游戏目录中的文件访问仍受当前用户的 Windows 权限和 Tauri 文件作用域控制。
- 使用系统 Evergreen WebView2。启动前检查其存在性；缺失时用原生对话框提供微软官方下载入口并退出，不执行同步。
- 应用设置和 WebView2 数据保存在应用数据目录，不写入只读 MSIX 安装目录。

## 审核示例

```powershell
pnpm store:sample
```

生成器放在 `tests/helpers/`，脚本只为本地测试编译它们，不将它们加入应用。生成文件位于 `artifacts/store-sample/WorldOfWarcraft`，没有真实账号、角色、邮件或聊天数据。

示例只用于离线验证，不是游戏安装包，也不能直接用于真实游戏。上传前应制作生成数据的实际应用截图，并将示例档案及英文步骤提供给认证人员。

`certification-notes.txt` 保存英文认证步骤、`runFullTrust` 用途和实测边界。Partner Center 的其他测试信息页只有说明与凭据字段，因此说明末尾包含 `create-review-fixture.ps1` 的完整脚本，用两个虚构账号生成可直接测试的最小目录。脚本拒绝覆盖已存在的目录。这个最小目录已经通过实际同步引擎验证；丰富的角色截图仍由 `pnpm store:sample` 生成。

本地完整审核压缩包应保留 `WorldOfWarcraft/` 根目录及 `.build.info`、`.flavor.info` 等隐藏元数据，排除验证时生成的 `BiaoGeAccounts`，以便执行首次同步。它不是商店页面的附件，不应声称已经上传给微软。

商店桌面截图使用真实应用画面和生成数据，必须是实际 PNG 编码；仅修改扩展名不能将 JPEG 截图变成 PNG。

## 图标

图标从现有 `public/icon.png` 生成。更新原图后可同步 MSIX 资源：

```powershell
pnpm exec winapp manifest update-assets public/icon.png --manifest packaging/windows/Package.appxmanifest
```
