# 将导入宠物复制到 user data

Imported Pet 导入后会复制到应用管理的 `userData/imported-pets/<pet-id>/` 目录，而不是引用用户原始的 Import Folder。这样桌面端在 macOS 和 Windows 上都能拥有稳定的资源生命周期，避免用户移动、删除原目录或系统权限变化后导致宠物失效。

## 考虑过的方案

- 原地引用用户选择的 Import Folder。
- 将 Imported Pet 复制到应用管理的 user data 目录。

## 影响

应用会额外占用一份磁盘空间，但宠物包通常足够小；相比节省空间，稳定性更重要。
