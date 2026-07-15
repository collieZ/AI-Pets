# Imported Pet Transaction 重构计划

> 本计划按安全优先顺序执行。每个任务完成后都应独立通过测试；不要把全部任务压进一次提交。

**目标：** 将当前 Imported Pet 导入、覆盖、删除、恢复与资源授权收口为一个 deep module，并让导入预检和运行时加载共享 canonical Pet Package 校验。

**架构：** Electron 主进程使用 TypeScript 源码并构建为 CommonJS 产物。Imported Pet transaction module 是主进程内唯一 mutation seam；真实文件系统 adapter 用于生产和集成测试，故障注入 adapter 用于失败恢复测试。renderer 只消费意图级操作和结构化结果。

**固定约束：** 全局串行、全有或全无、拒绝 symlink、单包 500 MB/1000 文件/深度 8、最多 30 个 Imported Pet、预检快照 30 分钟、异常数据进入 Imported Pet Quarantine、默认回退 Built-in Pet“怡宝”。

---

## Task 1：建立安全特征测试并做最小封堵

**Files:**

- Modify: `apps/desktop/electron/importedPets.cjs`
- Modify: `tests/imported-pets-service.test.cjs`
- Modify: `package.json`

- [ ] 增加 `petId` 为 `.`、`..`、空白和平台保留名称的拒绝测试。
- [ ] 增加 manifest、spritesheet、嵌套目录 symlink 越界测试。
- [ ] 增加损坏 Imported Pet Index 配合删除/覆盖的路径安全测试。
- [ ] 在现有 CommonJS implementation 中先收紧 ID，并对 Import Folder 做不跟随 symlink 的遍历检查。
- [ ] 把现存 `desktop-sprite-layout.test.ts` 纳入根测试命令，避免“文件存在但未执行”。
- [ ] 运行 `pnpm test`；退出条件是所有越界场景在任何 mutation 前被拒绝。

**回滚点：** 此任务不改变 IPC 和目录格式，可以独立发布。

## Task 2：建立 Electron TypeScript 构建链

**Files:**

- Create: `apps/desktop/electron/src/main.ts`
- Create: `apps/desktop/electron/src/preload.ts`
- Create: `apps/desktop/electron/src/contracts.ts`
- Create: `apps/desktop/electron/tsconfig.json`
- Create: `apps/desktop/electron/build.mjs`
- Modify: `apps/desktop/package.json`

- [ ] 定义主进程、preload 和 renderer 共用的 IPC contracts，移除 `App.tsx` 中重复声明的桌面类型。
- [ ] 使用构建脚本把主进程和 preload 打包为 CommonJS，允许直接消费 workspace TypeScript packages。
- [ ] 保持 electron-builder 的入口和打包文件列表指向编译产物。
- [ ] 迁移窗口、托盘、自定义协议和现有 IPC，行为保持不变。
- [ ] 增加构建产物 smoke test：主进程与 preload 可被 Node 解析，renderer build 不依赖 Node 内置模块。
- [ ] 运行 `pnpm test`、desktop typecheck、desktop build 和 `desktop:pack`。

**回滚点：** 旧 CommonJS 文件保留到打包 smoke test 通过，再在单独提交中删除。

## Task 3：统一 canonical Pet Package intake

**Files:**

- Modify: `packages/pet-protocol/src/validate.ts`
- Modify: `packages/pet-protocol/src/types.ts`
- Modify: `packages/codex-pet-adapter/src/index.ts`
- Create: `apps/desktop/electron/src/petPackageIntake.ts`
- Modify: `tests/renderer.test.ts`
- Create: `tests/pet-package-intake.test.ts`

- [ ] 补齐协议 invariants：状态与动画引用、atlas 行列范围、interaction 引用、capability 值和安全资源路径。
- [ ] 让 AI Pet Protocol adapter 与 Codex Pet adapter 在同一 seam 产出 canonical Pet Package。
- [ ] intake 同时返回导入预览数据和 manifest 声明资源集合。
- [ ] Built-in Pet、Import Folder 预检和运行时加载复用同一 validation result。
- [ ] 错误映射为稳定类别并包含字段路径；底层异常不越过 module interface。
- [ ] 删除 `importedPets.cjs` 中重复协议知识之前，先让两种格式的端到端测试通过。

**退出条件：** “预检成功但 renderer 校验失败”在 module interface 上不可表达。

## Task 4：实现不可变 Import Snapshot

**Files:**

- Create: `apps/desktop/electron/src/importedPets/importSnapshot.ts`
- Create: `apps/desktop/electron/src/importedPets/resourceBudget.ts`
- Create: `tests/import-snapshot.test.ts`

- [ ] 选择 Import Folder 时遍历并复制到唯一 staging 目录，不跟随 symlink。
- [ ] 遍历期间执行 500 MB、1000 文件、深度 8 和普通文件类型限制。
- [ ] 对 staging snapshot 执行 canonical Pet Package intake，而不是再次读取原目录。
- [ ] 为 snapshot 生成不可猜测 token；renderer 不接触原始文件路径。
- [ ] 全局仅保留一个待确认 snapshot；新选择、取消、设置窗口关闭、退出和 30 分钟超时都清理旧 snapshot。
- [ ] 测试预检后修改原 Import Folder 不会改变最终导入内容。

## Task 5：实现 Imported Pet transaction module

**Files:**

- Create: `apps/desktop/electron/src/importedPets/transaction.ts`
- Create: `apps/desktop/electron/src/importedPets/filesystemAdapter.ts`
- Create: `apps/desktop/electron/src/importedPets/indexRepository.ts`
- Create: `tests/imported-pet-transaction.test.ts`

- [ ] module 统一处理新增、覆盖、删除、确认和取消；所有 mutation 进入同一串行队列。
- [ ] `petId` 是唯一身份；名称允许重复；30 个上限只阻止新 ID，不阻止覆盖。
- [ ] 使用唯一 staging、backup 和 transaction record 实现全有或全无目录交换。
- [ ] 索引只持久化可信身份数据；catalog URL 等派生值在 module 内重建。
- [ ] 删除当前 Imported Pet 成功后通知 session 回退“怡宝”；失败不改变当前选择。
- [ ] 使用真实临时目录测试正常行为，使用故障注入 adapter 覆盖每个 commit point。

**退出条件：** 在复制、rename、索引写入或删除任一点注入失败，目录和 Imported Pet Index 都保持操作前可用状态。

## Task 6：实现启动恢复、迁移与隔离

**Files:**

- Create: `apps/desktop/electron/src/importedPets/recovery.ts`
- Create: `apps/desktop/electron/src/importedPets/migration.ts`
- Create: `tests/imported-pet-recovery.test.ts`

- [ ] 启动时先恢复未完成 transaction，再向 renderer 发布 catalog。
- [ ] 首次迁移备份旧 index，并重新校验现有 Imported Pet。
- [ ] 合法数据原地保留；非法 ID、symlink、缺失资源和无效协议进入 Imported Pet Quarantine。
- [ ] 未被 index 记录的目录进入隔离区，不自动导入；失效 index 条目从可用 catalog 移除。
- [ ] 提供一次性恢复摘要和“打开隔离目录”能力，不使用阻塞对话框。
- [ ] 测试进程在每个 transaction 阶段中断后的下一次启动恢复。

## Task 7：收窄 IPC 与 custom protocol adapter

**Files:**

- Modify: `apps/desktop/electron/src/contracts.ts`
- Modify: `apps/desktop/electron/src/main.ts`
- Modify: `apps/desktop/electron/src/preload.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/styles.css`

- [ ] renderer 只发送选择、确认、取消、删除和打开隔离目录等意图，不传文件路径或底层 overwrite flags。
- [ ] Settings View 展示 snapshot preview、容量/数量限制、稳定错误类别和恢复摘要。
- [ ] custom protocol adapter 向 transaction module 查询授权，只允许 manifest 声明资源。
- [ ] 资源 URL 使用安全 URL 构造，不再由 renderer 字符串拼接。
- [ ] 删除旧 `pendingPetImport`、重复 result union 和 renderer 侧来源格式判断。
- [ ] 增加 IPC contract 测试和 custom protocol 未声明资源拒绝测试。

## Task 8：替换旧 implementation 并完成验收

**Files:**

- Delete: `apps/desktop/electron/importedPets.cjs`
- Delete: `apps/desktop/electron/preferences.cjs`（仅在 TypeScript 版本已替代时）
- Delete: `apps/desktop/electron/main.cjs`（源码版本；保留构建产物）
- Delete: `apps/desktop/electron/preload.cjs`（源码版本；保留构建产物）
- Modify: `docs/roadmap/pet-import-storage.md`
- Modify: `docs/poc/package-validation-preview.md`

- [ ] 新 module interface 测试覆盖后，删除只验证旧 helper implementation 的测试。
- [ ] 清理旧 CJS 源码和重复协议校验。
- [ ] 更新中文文档，说明 transaction、snapshot、quarantine 和资源授权。
- [ ] 运行全量 test、typecheck、build、macOS pack 与手动导入/覆盖/删除/恢复验收。
- [ ] Windows 未有验证机器时保留明确的打包与手动验收清单，不宣称已完成 Windows 兼容验证。

## 完成标准

- [ ] Import Folder 无法通过 ID、路径、symlink 或特殊文件越过管理目录。
- [ ] 任何 transaction 失败或中断后，最后一次已提交的 Imported Pet 仍可加载。
- [ ] 导入预检与运行时加载使用同一个 canonical Pet Package validation result。
- [ ] renderer 不知道本地文件路径、索引格式、transaction commit 顺序或平台文件系统错误。
- [ ] custom protocol 无法读取未声明资源。
- [ ] migration、recovery、30 个上限和当前宠物回退均有 module interface 测试。
