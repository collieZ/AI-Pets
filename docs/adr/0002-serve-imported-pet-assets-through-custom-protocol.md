# 通过自定义协议提供导入宠物资源

Imported Pet 的资源通过主进程自定义协议提供给 renderer，例如 `ai-pets://imported-pets/<pet-id>/<asset>`，而不是直接暴露 `file://` 路径。这样文件系统访问会被收口到应用可控边界内，主进程可以限制请求只能读取 `userData/imported-pets`，同时避免把 macOS 和 Windows 的本地路径差异泄漏到 renderer。

## 考虑过的方案

- 直接向 renderer 暴露 `file://` URL。
- 通过主进程自定义协议提供 Imported Pet 资源。

## 影响

主进程需要负责 URL 解析、路径规范化、MIME 处理和路径穿越检查，但 Imported Pet 的资源加载会更安全，也更容易跨平台保持一致。
