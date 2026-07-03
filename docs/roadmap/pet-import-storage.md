# 宠物资源导入与存储方案

本文记录桌面端后续实现“导入宠物包”时的资源来源、存储位置和读取策略。目标是区分内置资源和用户导入资源，避免把用户资源写入项目目录或应用安装产物。

## 当前资源来源

当前桌面端宠物列表来自 `apps/desktop/src/petCatalog.ts`：

- `example-buddy` 指向 `pets/example-buddy/manifest.json` 和 `spritesheet.svg`。
- `yibao-codex` 指向 `pets/yibao-codex/pet.json` 和 `spritesheet.webp`。

这些路径由 `import.meta.env.BASE_URL` 拼接，实际资源来自 Vite 静态资源目录 `apps/web-poc/public/pets/`，打包后会进入应用产物，属于内置宠物。

## 推荐目录

用户导入资源应存到 Electron 的 `app.getPath("userData")` 下，不写入项目源码目录，也不写入应用安装目录。

推荐结构：

```text
<userData>/imported-pets/
  index.json
  <pet-id>/
    manifest.json 或 pet.json
    spritesheet.webp
    source.json
```

系统上的典型位置：

- macOS: `~/Library/Application Support/AI-Pets/imported-pets/`
- Windows: `%APPDATA%/AI-Pets/imported-pets/`

`userData` 由 Electron 按 app name/app id 管理，适合放用户配置、导入资源和运行时索引。应用升级时，这个目录通常不会被覆盖。

## 读取策略

后续宠物列表建议合并两类来源：

- 内置宠物：继续从打包资源读取，随应用发布。
- 用户宠物：启动时由主进程扫描 `<userData>/imported-pets/index.json`，通过安全 IPC 暴露给 renderer。

renderer 侧合并 catalog 时，Built-in Pet 始终保留在前，Imported Pet 追加在后。如果 Imported Pet 的 `id` 与 Built-in Pet 冲突，Built-in Pet 优先，Imported Pet 不覆盖内置项。这样可以避免用户导入包意外替换应用内置资源。

renderer 不应直接猜测本地文件路径。推荐由主进程提供：

- `desktop:list-imported-pets`：返回 Imported Pet catalog。
- `desktop:select-import-pet-folder`：由主进程打开目录选择器，并复制用户选择的 Import Folder 到 `imported-pets/<pet-id>/`。
- `desktop:confirm-import-pet-folder-overwrite`：当同 id 宠物已存在时，确认覆盖 pending 导入。
- `desktop:get-pet-asset-url` 或自定义协议：把用户资源转换成安全可读 URL。

Imported Pet Index 由主进程维护，存放在 `<userData>/imported-pets/index.json`。renderer 只消费主进程通过 IPC 返回的 catalog，不直接扫描 `imported-pets` 目录，也不直接读写 `index.json`。

Imported Pet 的运行时资源应通过主进程注册的自定义协议提供，例如：

```text
ai-pets://imported-pets/<pet-id>/<asset>
```

该协议使用 Electron `protocol.handle` 在主进程注册，配合 `net.fetch(pathToFileURL(...))` 返回本地文件。scheme 必须启用 `standard`、`secure`、`supportFetchAPI` 和 `corsEnabled`，响应也要带 `access-control-allow-origin`，否则 renderer 使用 `fetch()` 读取 Imported Pet manifest 时会被 Chromium 拦截并表现为 `Failed to fetch`。主进程需要保证该协议只能映射到 `<userData>/imported-pets` 内部文件，并拦截 `..`、编码后的路径穿越和非 `imported-pets` host。

## 导入流程

推荐流程：

1. 用户在设置页选择一个目录或压缩包。
2. 主进程读取并校验 manifest。
3. 对 AI Pet Protocol 资源直接使用 `validatePetPackage` 校验。
4. 对 Codex pet 资源先通过 `adaptCodexPet` 转换，再校验。
5. 校验通过后复制到 `<userData>/imported-pets/<pet-id>/`。
6. 更新 `<userData>/imported-pets/index.json`。
7. 通知 renderer 刷新宠物列表。
8. 设置页在导入成功后自动选择该 Imported Pet；如果同 id 已存在，先提示用户确认覆盖。

## 兼容注意

不要把用户导入资源放在以下位置：

- `apps/web-poc/public/pets/`：这是源码静态目录，打包后不可写。
- `apps/desktop/dist/`：这是构建产物，会被重新构建覆盖。
- 应用安装目录：macOS `.app` 和 Windows 安装目录都不适合保存用户数据。

后续如果支持删除或更新导入宠物，只操作 `userData/imported-pets`，不要影响内置宠物。
