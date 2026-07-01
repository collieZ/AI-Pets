# Web POC 使用说明

## 环境准备

确认本机已安装 Node.js 和 pnpm，并在项目根目录执行命令。Web POC 位于 `apps/web-poc`，协议、渲染器和 Codex 适配器位于 `packages` 目录。

## 安装依赖

```powershell
pnpm install
```

该命令会安装 workspace 内 Web POC、协议包、渲染包和适配器所需依赖。

## 导入 yibao

```powershell
pnpm import:yibao
```

该命令把本机 Codex 宠物怡宝导入到 Web POC 的静态宠物目录，并生成可供 POC 加载的 AI Pet Protocol manifest。导入源为本机 Codex 宠物包，默认用于验证 Codex 兼容适配链路。

## 启动 Web POC

```powershell
pnpm dev
```

启动后打开终端输出的本地地址。页面会加载示例宠物目录，并提供宠物选择、状态按钮、事件触发和气泡展示。

## 界面控件说明

- 宠物选择：切换当前加载的宠物包。
- 状态按钮：根据 manifest 的 `states` 动态生成，按钮文案来自状态的中文 `label`。
- 交互事件按钮：根据 manifest 的 `interactions` 触发状态和气泡文本。
- 宠物显示区：按 `assets.atlas` 和当前 animation 播放 spritesheet。
- 气泡文本：显示 interaction 的 `say` 内容，适合验证 AI 事件反馈。

## 手动验证清单

- 运行 `pnpm install` 后依赖安装成功。
- 运行 `pnpm import:yibao` 后 Web POC 静态目录中出现怡宝宠物包。
- 运行 `pnpm dev` 后页面能正常打开。
- 宠物选择控件中能看到导入的 yibao。
- 所有 `states` 都生成对应状态按钮。
- 自定义状态按钮会动态出现，不需要修改 Web POC 代码。
- 点击状态按钮后，动画行、帧数和帧率符合 manifest；当前 Web POC 的帧计算始终循环，不验证非循环播放。
- 点击 interaction 按钮后，状态切换和气泡文本符合 manifest。
- 浏览器控制台没有协议校验错误。
