# 主进程维护导入宠物索引

Imported Pet Index 由 Electron 主进程维护，存放在 `userData/imported-pets/index.json`，renderer 只通过 IPC 获取合并后的宠物 catalog。这样导入、覆盖、删除、资源协议映射和索引一致性都由同一个可信边界负责，避免 renderer 直接扫描本地文件系统或自行拼接资源路径。

## 考虑过的方案

- renderer 自己维护或扫描 Imported Pet 列表。
- 主进程维护 Imported Pet Index，并通过 IPC 暴露只读 catalog 和导入操作。

## 影响

主进程需要增加索引读写和 catalog 合并逻辑，但宠物资源生命周期更清晰，后续也更容易加入权限校验、迁移和错误恢复。
