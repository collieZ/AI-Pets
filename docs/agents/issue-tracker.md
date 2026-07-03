# Issue tracker：GitHub

本仓库的任务、需求和 PRD 使用 GitHub Issues 管理。相关操作默认使用 `gh` CLI。

## 约定

- **创建 issue**：`gh issue create --title "..." --body "..."`。多行正文可使用 heredoc。
- **读取 issue**：`gh issue view <number> --comments`，并按需读取 labels 和 comments。
- **列出 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按需要添加 `--label` 和 `--state` 过滤。
- **评论 issue**：`gh issue comment <number> --body "..."`
- **添加或移除 label**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭 issue**：`gh issue close <number> --comment "..."`

在仓库目录内运行时，`gh` 会自动从 `git remote -v` 推断目标仓库。

## PR 是否进入 triage

**外部 PR 不作为 triage 请求入口。**

如果未来改为 `yes`，PR 将和 issue 使用相同的 labels 与状态机，并使用 `gh pr` 对应命令：

- **读取 PR**：`gh pr view <number> --comments`，需要查看改动时使用 `gh pr diff <number>`。
- **列出外部 PR**：`gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，只保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE` 的 PR。
- **评论 / 加标签 / 关闭**：`gh pr comment`、`gh pr edit --add-label` / `--remove-label`、`gh pr close`。

GitHub 的 issue 和 PR 共用编号空间，因此 `#42` 可能是 issue，也可能是 PR。需要时先尝试 `gh pr view 42`，失败后再使用 `gh issue view 42`。

## 当 skill 要求“发布到 issue tracker”

创建 GitHub Issue。

## 当 skill 要求“获取相关 ticket”

运行 `gh issue view <number> --comments`。

## Wayfinding 操作

供 `/wayfinder` 使用。**Map** 是一个 issue，**child ticket** 是它拆出的子 issue。

- **Map**：使用 `wayfinder:map` label 的单个 issue，正文保存 Notes / Decisions-so-far / Fog。创建时使用 `gh issue create --label wayfinder:map`。
- **Child ticket**：优先使用 GitHub sub-issue 关联到 map；如果 sub-issue 不可用，则在 map 正文 task list 中引用，并在 child issue 顶部写 `Part of #<map>`。标签使用 `wayfinder:<type>`（`research` / `prototype` / `grilling` / `task`），认领后加 `wayfinder:claimed`。
- **Blocking**：优先使用 GitHub 原生 issue relationship；不可用时，在 child issue 顶部写 `Blocked by: #<n>, #<n>`。列出的 blocker 全部关闭后，该 ticket 视为解除阻塞。
- **Frontier query**：列出 map 下仍 open 的 child issues，过滤掉仍被 open issue 阻塞或带 `wayfinder:claimed` 的 ticket，按 map 顺序取第一个。
- **Claim**：`gh issue edit <n> --add-label wayfinder:claimed`。
- **Resolve**：`gh issue comment <n> --body "<answer>"`，随后 `gh issue close <n>`，并把上下文指针追加到 map 的 Decisions-so-far。
