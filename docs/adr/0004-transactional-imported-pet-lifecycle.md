# Imported Pet 使用事务式生命周期

Imported Pet 的新增、覆盖和删除采用全有或全无的 Imported Pet Transaction，并由 Electron 主进程中的 deep module 统一拥有预检快照、路径安全、Imported Pet Index、恢复、隔离、catalog 生成和资源授权。主进程迁移为 TypeScript，以直接复用 AI Pet Protocol validator 和 Codex Pet adapter；相比继续维护 CommonJS 手写校验，这会增加构建步骤和临时磁盘占用，但能让导入预览与运行时加载共享同一套 Pet Package 知识，并满足 ADR-0002 与 ADR-0003 的安全承诺。

## 影响

- Import Folder 必须自包含并拒绝 symlink；单包最多 500 MB、1000 个文件、目录深度最多 8。
- Pet Library 最多包含 30 个 Imported Pet；相同 `petId` 只能覆盖，达到上限后仍允许覆盖已有 ID。
- 所有 Imported Pet Transaction 全局串行；失败或进程中断后恢复到最后一次已提交状态。
- 无法安全恢复的数据进入 Imported Pet Quarantine，不自动删除或自动导入。
- `ai-pets://` 只允许访问 manifest 明确声明的资源。
