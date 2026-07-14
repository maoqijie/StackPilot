# AGENTS.md

## Scope and source of truth

This file governs all user-interface work in this repository. `DESIGN.md` is the source of truth for the visual system. Implement the CloudPulse design language exactly as specified here. Do not introduce colors, type scales, spacing values, radii, shadows, component variants, or monitoring behavior that conflict with these rules.

CloudPulse must feel airy, calm, trustworthy, and visibly active. It is intended for cloud infrastructure monitoring and DevOps dashboards. Interfaces must communicate complex system health without overwhelming operators during routine checks or incidents. Use generous whitespace, soft rounded surfaces, and the defined sky-to-violet language.

## UI implementation constraints learned from review

- `DESIGN.md` is the only authority for visual decisions. Do not invent, infer, or add decorative treatments, component variants, colors, gradients, shadows, spacing, shapes, icons, or interaction styling that `DESIGN.md` does not explicitly define.
- When a requested component is not fully specified, use the smallest neutral implementation composed only from existing `DESIGN.md` tokens. Do not fill gaps with personal design preferences.
- Sidebars and navigation must not use line-based decoration. Do not add borders, outlines, divider lines, left or right selection bars, inset line shadows, curved edge strokes, or pseudo-elements that render a line.
- Navigation selection must be communicated without line borders. Use only the text, icon, and background states explicitly allowed by `DESIGN.md`.
- Parent navigation, its icon, label, badge, and expand indicator must remain one button and one click target. Do not create a separate expand button or nest buttons.
- Expanded sidebar groups must behave as a single-open accordion. Opening one group closes every other group.
- Sidebar content must remain scrollable when it overflows, but the scrollbar track and thumb must not be visible.
- Place the expand indicator against the right content inset defined by the spacing scale. Do not reserve an unused grid column or leave unexplained trailing space.
- Before completing sidebar work, inspect the rendered desktop and mobile UI. Verify computed styles and interaction behavior, not only source code.

## Overview and live-monitoring constraints learned from review

These rules apply to the Overview workbench and its health, task, risk, and detail surfaces. They override the default card border recipe only where an Overview-specific rule explicitly removes a border.

### Surfaces and layout

- Overview cards, panels, tables, feeds, summary blocks, empty states, and their hover states must not render decorative line borders, outlines, inset line shadows, or pseudo-element strokes. Use whitespace, background contrast, and the permitted elevation recipes to establish hierarchy.
- Removing an Overview border includes every interaction state. Do not allow a border to reappear on hover, focus-within, selection, or active states, especially in the recent-activity feed.
- Do not nest decorative cards. Overview sections should remain unframed layouts; use card treatment only for genuinely discrete repeated items, modals, drawers, or tools.
- Task recommendations, recent activity, and risk warnings must use a clear scan order: one semantic icon, primary label, supporting context, freshness/time, and result or severity. Do not repeat status with both an ornamental dot and an icon.
- Status markers must use a semantic icon plus text when space permits. Small color dots are acceptable only as status lights and must not be the sole status signal.
- When a toolbar action is removed, the remaining actions must reflow naturally. Do not leave a fixed-width blank action column or placeholder gap.
- Fixed-format Overview grids, metric indicators, toolbars, and detail layouts must have stable responsive dimensions so loading, long labels, or refreshed values cannot shift adjacent content.

### Metrics and resource data

- Do not use black or near-black fills for metric bars or chart series. Use the semantic primary, secondary, tertiary, success, warning, and error colors from `DESIGN.md` according to meaning.
- Percentage metrics should use a circular progress indicator when the part-to-whole relationship is the primary information. Count metrics may use a full circular indicator only when it improves scanning; do not imply a percentage for an unbounded count.
- Circular indicators must retain a visible numeric value and unit. Color alone must not encode the measurement or health state.
- Disk usage must aggregate every detected volume, not display only the system volume. Calculate total utilization from the sum of used bytes divided by the sum of total bytes; do not average per-volume percentages.
- Disk details must remain inspectable. On hover or keyboard focus, show every volume's label, utilization, and used/total capacity in a tooltip that follows the `400ms` tooltip delay and the `DESIGN.md` tooltip tokens.
- Empty or unavailable resource data must be labeled as unavailable or awaiting collection. Never invent fixture metrics in the production UI.

### Tables, hostnames, and details

- Long hostnames must never obscure IP addresses, resource values, status, or operation controls. Desktop table cells should use a constrained width with ellipsis and a native title or equivalent accessible full-value affordance.
- In mobile cards, drawers, and detail headers, long hostnames may wrap with `overflow-wrap: anywhere`; the surrounding grid or flex child must use `min-width: 0` so the viewport does not overflow.
- Cluster-status operation controls must open complete, visible content. Detail drawers and modals must render above shell clipping and stacking contexts, using a body-level portal where necessary.
- A node detail surface must preserve the selected node by stable ID when fresh data arrives. If that ID no longer exists, close the stale detail instead of showing a different node.
- Detail surfaces must expose the operational information needed to understand the row: node identity, status, latency, resources, version, uptime, backup, update state, owner, and service instances when those fields are available.
- Opening a drawer must not resize or shift the underlying content unexpectedly. Drawer headers and body content must remain readable with long names at desktop and mobile widths.

### Sidebar-responsive content

- Collapsing the sidebar must cause the main content track to recompute its available width. Do not simulate collapse by translating the whole page or by retaining the expanded sidebar's reserved width.
- The main content must fill the remaining viewport without a blank strip on the right, horizontal overflow, or a leftward-only shift. Use responsive grid/flex tracks with `min-width: 0` and width derived from the current sidebar state.
- Mobile sidebar overlays must not change the document width. When the overlay closes, restore focus to the control that opened it.

### Automatic refresh

- Overview, cluster health, task, risk, and shared top-bar monitoring data must refresh automatically. Do not expose page-level `刷新`, `刷新状态`, `重新采集`, or `重新扫描` controls for data that is already polled.
- Keep explicit `重试` actions for failed initial loads. An empty successful response must continue automatic collection without presenting a manual refresh substitute.
- Use read-only `GET` endpoints for polling. Never invoke mutation, scan, task execution, or notification-producing endpoints from an automatic refresh loop.
- The default polling interval is `10` seconds. A faster interval is prohibited unless the UI has a continuously visible loading indicator, as required by `DESIGN.md`.
- Initial loading may show the normal loading state. Subsequent polling must be silent: retain current data, avoid layout jumps, and do not display success toasts or repeated error notifications.
- Do not overlap requests. Start periodic polling after the initial request settles, abort superseded or unmounted requests, and clean up timers, listeners, and abort controllers.
- Pause polling while `document.hidden` is true. Refresh immediately when the document becomes visible again, then resume the normal interval.
- Background failures must preserve the last successful data and visible freshness value. Initial-load and explicit-retry failures may use the standard error state and notification behavior.
- Refresh reconciliation must preserve active filters, tabs, search text, and open details by stable ID. Do not reset the operator's context on each response.
- Every automatically refreshed surface must display the backend-provided collection or scan timestamp. Do not replace backend freshness with a client-side timestamp when the backend supplies one.

## Color system

Use these semantic colors consistently:

- Primary: `#0EA5E9` for primary actions, active navigation, and healthy status indicators.
- Secondary: `#8B5CF6` for accent highlights, secondary actions, and graph gradients.
- Tertiary: `#14B8A6` for positive metrics, availability badges, and throughput markers.
- Background: `#F8FAFC` for the application canvas in light mode.
- Surface: `#FFFFFF` for cards, modals, and popovers.
- Success: `#22C55E`.
- Warning: `#EAB308`.
- Error: `#EF4444`.
- Info: `#0EA5E9`.

Reserve red strictly for errors, critical conditions, and outages. Never use red for neutral emphasis or decoration. Status must never rely on color alone; always pair color with a text label or icon.

## Typography

Use only the designated font family for each role:

- Headlines: Plus Jakarta Sans.
- Body copy: DM Sans.
- Logs, configuration values, CLI text, and code: Roboto Mono.

Apply the following type styles without substitution:

| Style | Font | Size | Weight | Line height | Tracking | Use |
| --- | --- | ---: | --- | ---: | ---: | --- |
| Display | Plus Jakarta Sans | 52px | Extra-bold | 1.1 | 0.025em | Status hero banners |
| Headline | Plus Jakarta Sans | 40px | Bold | 1.2 | 0.015em | Page headings |
| Subhead | Plus Jakarta Sans | 28px | Semibold | 1.3 | 0.01em | Section and panel headings |
| Body Large | DM Sans | 18px | Regular | 1.6 | Default | Lead paragraphs and alert messages |
| Body | DM Sans | 16px | Regular | 1.6 | Default | Default body text |
| Body Small | DM Sans | 14px | Regular | 1.5 | Default | Table cells and metadata |
| Caption | DM Sans | 12px | Medium | 1.4 | 0.01em | Timestamps and chart labels |
| Overline | DM Sans | 11px | Bold | 1.2 | 0.1em | Uppercase service tags and environment labels |
| Code | Roboto Mono | 14px | Regular | 1.5 | Default | Logs, configuration, and CLI content |

## Spacing

Use an `8px` base unit and only this spacing scale:

`0`, `4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `40px`, `48px`, `64px`, `80px`, `96px`.

Component padding must use:

- Small: `8px`.
- Medium: `16px`.
- Large: `24px`.

Section spacing must be:

- Mobile: `32px`.
- Tablet: `48px`.
- Desktop: `64px`.

## Border radius

Use radius by semantic role:

- None, `0`: inline code tokens and status bar edges.
- Small, `4px`: tags, small badges, and compact chips.
- Medium, `8px`: inputs, buttons, and dropdowns.
- Large, `12px`: cards, panels, and modals.
- XL, `20px`: feature callouts and onboarding dialogs.
- Full, `9999px`: avatars, status dots, and pill indicators.

Do not apply pill styling to controls that are not avatars, status dots, or pill indicators.

## Elevation

Elevation must remain subtle and diffused, with no harsh edges. Use only these shadow recipes:

- Subtle: `0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.03)`.
- Medium: `0 4px 8px -2px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`.
- Large: `0 12px 20px -4px rgba(15, 23, 42, 0.07), 0 4px 8px -4px rgba(15, 23, 42, 0.03)`.
- Overlay: `0 16px 32px -6px rgba(15, 23, 42, 0.10), 0 6px 12px -4px rgba(15, 23, 42, 0.05)`.
- Primary glow: `0 0 20px rgba(14, 165, 233, 0.15)`.

Use the primary glow only on cards representing live or actively updating services.

## Components

### Buttons

- Primary: `#0EA5E9` background, `#FFFFFF` text, `8px` radius, DM Sans `15px` at `600`, and `10px 20px` padding. Hover uses `#0284C7`. Active uses `#0369A1` and `transform: scale(0.98)`.
- Secondary: transparent background, `#0EA5E9` text, `1px solid #0EA5E9` border, `8px` radius, and `10px 20px` padding. Hover uses `#F0F9FF` background.
- Ghost: transparent background with `#64748B` text. Hover uses `#F1F5F9` background and `#0F172A` text.
- Destructive: `#EF4444` background with white text. Hover uses `#DC2626`.
- Heights: small `34px`, medium `40px`, large `48px`.
- Disabled: `40%` opacity and a disabled cursor.

### Cards

- Default: `#FFFFFF` background, `1px solid #E2E8F0` border, `12px` radius, and `20px` padding. Hover border is `#CBD5E1`.
- Elevated: medium shadow. Hover transitions to the large shadow and translates upward by `1px`.

### Inputs

- Text input: `#FFFFFF` background, `1px solid #E2E8F0` border, `#0F172A` text, `8px` radius, DM Sans `15px`, `10px 14px` padding, and `40px` height.
- Placeholder: `#94A3B8`.
- Focus: `#0EA5E9` border with a `3px` ring using `rgba(14, 165, 233, 0.12)`.
- Error: `#EF4444` border and `#EF4444` message.
- Disabled: `#F8FAFC` background and text at `50%` opacity.
- Label: above the input, DM Sans `14px`, weight `500`, color `#334155`.
- Helper text: `13px`, color `#64748B`.

### Chips

- Filter chip: `8px` radius, `1px solid #E2E8F0`, `13px` at weight `500`, `32px` height, and `10px` horizontal padding.
- Selected filter chip: `#0EA5E9` background, `#FFFFFF` text, transparent border.
- Filter hover: `#F1F5F9` background.
- Healthy status chip: `#F0FDF4` background, `#16A34A` text, `#BBF7D0` border.
- Degraded status chip: `#FEFCE8` background, `#CA8A04` text, `#FEF08A` border.
- Down status chip: `#FEF2F2` background, `#DC2626` text, `#FECACA` border.

### Lists

- Default list item: DM Sans `15px`, `48px` height, `12px 16px` padding, and a `1px solid #F1F5F9` divider.
- Icons are `20px`, with `12px` between icon and text.
- Hover uses `#F8FAFC` background.
- Selected uses `#F0F9FF` background, `#0EA5E9` text, and a `2px solid #0EA5E9` left border.

### Checkboxes

- Box: `18px`, `1.5px solid #CBD5E1`, `4px` radius.
- Checked: `#0EA5E9` background with a white checkmark.
- Indeterminate: `#0EA5E9` background with a white dash.
- Disabled: `40%` opacity.
- Label: DM Sans `15px`, with `10px` spacing from the box.

### Radio buttons

- Outer circle: `18px`, `1.5px solid #CBD5E1`.
- Selected: `#0EA5E9` border with a `9px` `#0EA5E9` inner dot.
- Disabled: `40%` opacity.
- Label: DM Sans `15px`, with `10px` spacing from the control.

### Tooltips

- `#0F172A` background, `#F8FAFC` text, `8px` radius, `13px` at weight `500`, and `8px 12px` padding.
- Maximum width: `260px`.
- Arrow: `7px`.
- Delay: `400ms`.
- Default placement: top.

## Monitoring behavior

- Use semantic status colors consistently: green for healthy, yellow for degraded, and red for critical.
- Pair real-time data with a visible timestamp so operators can judge freshness at a glance.
- Use the primary glow on live or actively updating monitoring cards.
- Do not refresh data more frequently than every `10` seconds unless a visible loading indicator is present.
- Never display more than three alert banners at once. When more alerts exist, summarize them in one grouped notification.
- Never communicate status using color alone; include a text label or icon.

## Review checklist

Before completing UI work, verify all of the following:

- The result feels airy, calm, trustworthy, and readable during both routine monitoring and incidents.
- All colors use the defined semantic palette and red appears only for errors or outages.
- Typography uses Plus Jakarta Sans, DM Sans, and Roboto Mono in their assigned roles.
- Spacing, radii, shadows, component sizes, and interaction states match this file.
- Live data includes visible freshness information.
- Auto-refresh and alert-banner behavior follow the monitoring constraints.
- Overview has no decorative borders in default or interactive states, including recent-activity hover.
- Percentage and count visualizations communicate their meaning without black fills or color-only status.
- Disk utilization includes every volume and exposes per-volume details by hover and keyboard focus.
- Long hostnames remain contained in tables, mobile cards, and detail drawers without obscuring adjacent content.
- Sidebar collapse expands the content track to the available viewport width without translation, blank right space, or horizontal overflow.
- Automatic polling uses read-only requests at `10` seconds or slower, preserves operator context, and produces no toast spam.
- Desktop and mobile rendering have been inspected with a real browser; computed overflow, removed controls, drawers, hover states, and at least one complete polling cycle have been verified.
- Every status remains understandable without relying on color alone.

## Git 提交与推送

- 用户要求推送时，使用中文且能准确说明改动范围的提交标题和正文。
- 提交前必须更新项目版本号，并同步全部工作区包、内部依赖、锁文件及当前版本文档中的相关引用。
- 提交前检查暂存清单，禁止提交 `target/`、`node_modules/`、`dist/`、`build/`、`output/`、`coverage/` 等无关构建或运行产物。
- 提交目标为 `main` 主分支。推送前先获取远端 `main`；若远端内容更新，必须在远端最新版本基础上整合本地提交后再推送，不得覆盖远端历史。
- 出现合并或拣选冲突时，自行分析并解决，保留远端有效改动与本次预期改动；完成后运行与改动范围相称的验证。
- 推送失败时自动重试，最多三次；仅在三次均失败后向用户说明具体原因。
