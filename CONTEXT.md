# AI-Pets

AI-Pets 是一个桌面宠物系统，用于加载动画宠物包、渲染桌面陪伴角色，并同时支持内置宠物和用户导入宠物。

## Language

**Pet Package**：
一个完整的宠物定义，包含渲染桌面宠物所需的元数据、动画状态和 spritesheet 资源。
_避免_：Resource pack、skin、character bundle

**Built-in Pet**：
随应用一起发布并打包进应用产物的 Pet Package。
_避免_：Default pet、packaged import

**Imported Pet**：
用户在运行时添加，并存储到应用管理的 user data 目录中的 Pet Package。一个 Pet Library 最多包含 30 个 Imported Pet。
_避免_：Custom pet、external pet、local pet

**Import Folder**：
用户选择的一个自包含文件夹，里面包含一个 Pet Package manifest 以及它引用的 spritesheet 资源。Import Folder 及其子目录不得包含符号链接。
_避免_：Import archive、resource directory

**Imported Pet Index**：
由主进程维护的 Imported Pet 索引文件，记录已导入宠物的身份、来源类型和运行时资源入口。
_避免_：Frontend catalog、local cache、pet list

**Imported Pet Transaction**：
一次新增、覆盖或删除 Imported Pet 的完整变更。它具有全有或全无语义，失败后 Imported Pet 及 Imported Pet Index 必须保持操作前的可用状态。
_避免_：Partial import、copy operation

**Imported Pet Quarantine**：
用于保留无法与 Imported Pet Index 安全对应的数据。隔离的数据不会成为可用的 Imported Pet，也不会在恢复过程中被自动删除或自动导入。
_避免_：Orphan folder、trash directory
