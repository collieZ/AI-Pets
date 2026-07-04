# 桌面端 MVP 发布前收口

本文记录 AI-Pets 桌面端当前已验收的 MVP 能力、关键架构决策、发布前检查项和后续 TODO。它是总览文档；透明窗口、宠物导入、打包流程等细节仍以对应专题文档为准。

## 当前状态

桌面端 MVP 已完成以下主链路：

- Electron 桌面宠物窗口可运行，支持设置页、托盘菜单和退出。
- macOS 透明窗口残影问题已按当前方案处理，并在打包产物中完成手动验收。
- 内置宠物随应用打包发布。
- Imported Pet 支持从本地文件夹导入、复制到应用管理目录、运行时加载、选择和删除。
- Imported Pet 资源通过 `ai-pets://` 自定义协议由主进程提供，不直接暴露本地 `file://` 路径。
- `desktop:pack` 已执行，打包产物已完成基本手动验收。

## 架构总览

### 进程职责

- 主进程负责窗口生命周期、托盘菜单、Imported Pet 文件导入、Imported Pet Index、`ai-pets://` 协议和本地文件访问。
- renderer 负责宠物渲染、设置页 UI、用户操作入口和展示主进程返回的 catalog。
- preload 只暴露有限 IPC，不让 renderer 直接访问 Node.js 文件系统能力。

### 宠物来源

宠物分两类：

- Built-in Pet：随应用一起发布，资源来自打包产物。
- Imported Pet：用户运行时导入，复制到 `app.getPath("userData")/imported-pets/<pet-id>/`。

renderer 启动后会合并 Built-in Pet 和 Imported Pet：

- Built-in Pet 保留在前。
- Imported Pet 追加在后。
- 如果 Imported Pet 的 `id` 和 Built-in Pet 冲突，Built-in Pet 优先，Imported Pet 不覆盖内置项。

## Imported Pet 流程

MVP 只支持导入文件夹，不支持 zip。

流程：

1. 用户在设置页点击“导入宠物文件夹”。
2. 主进程打开系统目录选择器。
3. 主进程读取 `manifest.json` 或 `pet.json`。
4. 校验通过后复制到 `userData/imported-pets/<pet-id>/`。
5. 写入 `userData/imported-pets/index.json`。
6. 主进程广播 Imported Pet 变更。
7. renderer 刷新 catalog 并自动选择新导入宠物。
8. 如果同 id 已存在，设置页先提示用户确认覆盖。
9. 设置页支持查看已导入宠物、选择、删除。

详见 [宠物资源导入与存储方案](./pet-import-storage.md)。

## macOS 透明窗口方案

当前宠物窗口采用单 canvas 绘制可见内容，避免 DOM 背景图、气泡 DOM、加载提示 DOM 在透明窗口中形成多合成层残留。

macOS 特殊处理：

- 禁用硬件加速。
- pet 窗口使用真透明背景。
- pet 窗口关闭 shadow 和 background throttling。
- canvas 绘制后触发窗口 invalidation。
- 不使用低 alpha 背景伪清屏。

详见 [桌面端透明窗口渲染兼容记录](./desktop-rendering-compatibility.md)。

## 打包状态

当前使用 `electron-builder`：

- Windows：NSIS。
- macOS：DMG + zip。
- 基础图标已配置：`apps/desktop/assets/icon.png`、`icon.ico`、`icon.icns`。
- 当前图标源自 32x32 托盘图，只用于验证图标链路；正式发布前需要替换为 1024x1024 高清源图。
- 暂未启用签名、公证和自动更新。

详见 [Electron 桌面应用打包流程](./desktop-packaging.md)。

## 已记录 ADR

- [ADR 0001：将导入宠物复制到 user data](../adr/0001-copy-imported-pets-into-user-data.md)
- [ADR 0002：通过自定义协议提供导入宠物资源](../adr/0002-serve-imported-pet-assets-through-custom-protocol.md)
- [ADR 0003：主进程维护导入宠物索引](../adr/0003-main-process-owns-imported-pet-index.md)

## 发布前检查清单

每次准备发布桌面端前，至少检查：

- `npm test` 通过。
- `node_modules/.bin/tsc -p apps/desktop/tsconfig.json --noEmit` 通过。
- `node --check apps/desktop/electron/main.cjs` 通过。
- `node --check apps/desktop/electron/importedPets.cjs` 通过。
- `pnpm desktop:pack` 成功生成本地应用目录。
- macOS 打开打包 `.app` 后 Dock 图标出现，退出后 Dock 图标和进程都消失。
- 设置页可以切换 Built-in Pet。
- 设置页可以导入、选择、删除 Imported Pet。
- Imported Pet 退出重启后仍在列表中。
- 切换动作状态和模拟 AI 事件时，macOS 不出现明显透明残影。
- Windows 上透明窗口和导入宠物流程未因 macOS workaround 退化。

## 后续 TODO

优先级从高到低：

1. 替换正式高清应用图标，并重新生成 `.icns` / `.ico`。
2. 增加 Windows 代码签名。
3. 增加 macOS 签名与公证。
4. 设计自动更新策略。
5. 支持 zip 宠物包导入，并补路径穿越、解压大小和重复文件安全检查。
6. 增加 Imported Pet 重新导入覆盖入口。
7. 增加宠物包校验错误的更细分 UI 展示。
8. 如果 macOS 透明窗口残影再次复现，再评估原生 NSPanel/CALayer 或离屏渲染方案。
