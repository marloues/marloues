/** Produce a bounded evidence index. It deliberately does not equate a green
 * replay suite with complete equivalence to every private Codex behavior. */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = resolve(import.meta.dirname, "../..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const full = read("client/test-results/conversation-complete/results.json");
const browser = read("client/test-results/conversation-details/results.json");
const desktop = read("client/test-results/conversation-app/results.json");
const live = read("client/test-results/conversation-app-live/results.json");
const build = read("client/test-results/conversation-details/build.json");
if (
  full.results.filter((r) => r.id.startsWith("render-")).length !==
  full.scenes - 1
)
  throw Error("Refusing to publish a filtered replay as a full run");
if (
  full.results.some((r) => r.status !== "passed") ||
  !browser.success ||
  !desktop.success ||
  !live.success
)
  throw Error("Verification has failing checks");
for (const [name, result] of Object.entries({ full, desktop, live })) {
  if (result.build !== build.output)
    throw Error("Stale build evidence: " + name);
  if (result.errors?.length) throw Error("Renderer errors in " + name);
}
const group = (id, title, files, patterns, behavior, boundary = "") => ({
  id,
  title,
  files,
  patterns,
  behavior,
  boundary,
});
const groups = [
  group(
    "route",
    "轮次与渲染入口",
    [
      "TurnView",
      "TurnShell",
      "AssistantTurn",
      "AssistantTurnHeader",
      "TurnFlowSection",
      "TurnPresentationBlocks",
      "ThinkingPlaceholder",
      "ActivityRenderer",
      "ActivityGroup",
      "ActivityRow",
      "AgentFlowSection",
      "TurnItemRenderer",
      "TurnProcessDisclosure",
      "conversation-icons",
    ],
    ["render-", "host-timing", "D:canonical readThread"],
    "同一规范化轮次展示正文、过程、结果、计时与状态。无起点隐藏；首个 final 冻结 5 秒，正文增长仍为 5 秒；折叠切换位置不重复；旧历史与 300 项过程。嵌套工具逐层展开并记录。",
    "场景回放验证展示规则；不能证明任意模型都会产生这些事件。",
  ),
  group(
    "body",
    "Markdown 正文、引用和公式",
    ["MarkdownContent", "MarkdownContext", "AssistantAnswer"],
    ["markdown-semantic", "selection-to-composer", "B:formal turn"],
    "标题、段落、引用、列表起点、任务框、中文/RTL、GFM、脚注、引用定义、公式、完成后的选区进入输入框。",
  ),
  group(
    "table",
    "宽表格与预览",
    ["MarkdownTable", "ContentDialog"],
    ["table-overflow", "B:table"],
    "主体不被撑宽；预览横向滚动；复制 Markdown 和干净 HTML；Tab 约束、Escape、返回触发焦点。",
  ),
  group(
    "code",
    "代码、写作块、行内代码",
    ["CodeBlock", "InlineCode"],
    ["code-writing", "B:streaming code"],
    "复制正文、换行偏好和回到页面后的恢复；开放围栏到闭合保留 DOM；写作与代码模式区分。",
  ),
  group(
    "mermaid",
    "Mermaid",
    ["MermaidBlock"],
    ["mermaid-render", "B:invalid Mermaid"],
    "真实图表、源码切换、复制、预览；无效代码回退后恢复。",
    "语言前缀每一个长度及所有异步渲染竞态未穷举。",
  ),
  group(
    "links",
    "文件与链接",
    ["MarkdownLink"],
    ["file-preview", "user-attachments", "B:relative file"],
    "真实磁盘 IPC、相对路径、行号高亮、复制、缺失文件错误、未知协议回退。",
    "远端宿主、私有资源协议尚无真实服务验收。",
  ),
  group(
    "media",
    "图片音视频和画廊",
    ["MarkdownMedia", "ImageLightbox", "ImageGenerationRow"],
    [
      "media-loaded",
      "host-media",
      "gallery-keyboard",
      "image-status",
      "B:result gallery",
    ],
    "真实 SVG/WAV/WebM 解码、播放暂停、失败反馈和错误源换为有效源后恢复；多图方向键、缩放重置、Escape、焦点返回；Electron 下载完成后校验文件内容。",
    "网络媒体慢速/重定向/更换 src 的全部竞态未穷举。",
  ),
  group(
    "user",
    "用户消息与附件",
    ["UserMessage"],
    [
      "user-expand",
      "user-attachments",
      "attachment-layout-",
      "selection-to-composer",
    ],
    "长消息展开、复制、双击/按钮放回输入框；图片、文件、URL、技能、引用、批注；附件空消息保留。三主题/宽窄窗口下读取附件实际坐标，验证顺序、同排不重叠、长名截断和独立滚动；Tab 显露被裁切的标签，Enter 打开实际文件/行号，Escape 返回焦点。",
    "当前是文字复用，未实现带附件的历史原地编辑。PDF/Office 等专用预览及 Codex 条件文档卡片组尚未接入；普通 .ts 文件对应横向标签。",
  ),
  group(
    "commands",
    "命令详情",
    ["CommandExecutionRow", "CommandDetailCard", "DetailCopyButton"],
    ["command-state-", "host-command-running", "render-qa-command"],
    "运行/成功/失败/停止、退出码、命令独立时长、输出截断提示；输入输出复制、键盘折叠和重新进入。连续运行→完成保持收起选择，隐藏详情不留下可聚焦控件。",
    "真正脱离轮次的后台系统进程完成通知未单独端到端验证。",
  ),
  group(
    "files",
    "文件变更与结果",
    ["FileChangeRow", "ResultCards"],
    [
      "patch-terminal",
      "file-results",
      "failed-turn-retains",
      "render-qa-patch",
      "render-qa-many-files",
    ],
    "pending/applied/failed/rejected/cancelled 不混为成功；多文件展开、diff 复制、hover 预览和 Review 入口；失败轮次保留已应用产物。",
    "没有批次回滚 UI/宿主能力；重命名、二进制、跨 cwd 的所有组合未穷举。",
  ),
  group(
    "tools",
    "通用和专用工具",
    [
      "ToolCallRow",
      "ToolDetail",
      "ToolDetailFrame",
      "detail-sections",
      "WebSearchRow",
    ],
    [
      "tool-specialized",
      "generic-tool-cancel",
      "render-qa-dynamic",
      "render-qa-tool-details",
    ],
    "Read/LS/Grep/计划/搜索/浏览器专用详情；通用工具四种状态；不支持单工具取消时显示原错误并允许重试。",
    "SDK 不支持单工具取消，真实成功取消路径只存在其他 runtime，本次未冒充成功。",
  ),
  group(
    "mcp",
    "MCP 六类结果",
    ["McpResult"],
    ["mcp-six", "render-qa-mcp", "D:canonical readThread"],
    "text/image/audio/resource_link/embedded_resource/unknown；结构化同值去重、不同值保留、annotations/_meta/raw 复制。",
    "OAuth 自管远端 MCP 的原始信封保真未验收。",
  ),
  group(
    "apps",
    "MCP 交互卡",
    ["McpApp"],
    [
      "D:real MCP resource read failure",
      "D:MCP App tool permission",
      "D:MCP resource discovery",
      "D:collapsing and remounting MCP",
      "D:MCP App receives light/dark/warm",
    ],
    "真实 stdio 资源失败→重试→iframe；协议握手、输入/结果通知、拒绝/Escape/批准回传并真正执行工具；折叠后草稿保留。亮/暗/暖主题变量和强调色更新送入 iframe，切换不清空草稿。",
    "Codex 私有 App、superseded、不可折叠策略和 iframe 任意内部草稿的重启恢复未实现等价。",
  ),
  group(
    "questions",
    "提问与回答记录",
    ["QuestionCard"],
    [
      "question-validation",
      "settled-question",
      "render-qa-question",
      "D:SDK question",
      "D:real MCP elicitation",
    ],
    "文字/整数/数值/布尔/单选/多选校验，过期提交报错和草稿恢复；真实 SDK 问答、MCP 表单 accept/decline/cancel，停止后取消，终态不可再答。",
    "通用 kind 回退已检查；不等同支持全部八类 Codex 私有授权协议。",
  ),
  group(
    "permission",
    "权限历史与当前审批",
    ["PermissionRequestRow", "PermissionRequestPanel", "PermissionFilePreview"],
    ["permission-history", "host-permission-panel"],
    "五种历史状态；实际文件 diff 预览与焦点；拒绝、允许一次、允许此任务经过真实 preload 回到主进程。",
    "三种全局审批按钮使用宿主通知回放；真实工具副作用批准闭环另由 MCP App 流程验证。",
  ),
  group(
    "markers",
    "显式标记、未知项、协作",
    ["MarkerRows", "ActivityDetail", "CollabAgentToolRow"],
    ["marker-raw", "collab-status", "render-qa-markers"],
    "模型/工作区/压缩/评审/hook 等显式标记与 raw 展开；协作运行/完成/失败/停止，点击已知子任务进入对应会话。",
    "私有 heartbeat、特殊资源指令只有回退；辅助区内子代理标签管理不属于本次对话正文范围。",
  ),
  group(
    "errors",
    "错误与恢复",
    ["MessageErrorCard", "TurnErrorCard", "MarkdownErrorBoundary"],
    [
      "failed-turn-retains",
      "B:Markdown error boundary",
      "D:missing credentials",
    ],
    "断流已有正文和产物保留，错误详情复制和持久化；局部 renderer 异常不影响相邻内容，重试与 contentKey 更新恢复。",
    "重连 1/5→2/5 不是独立原生 UI，尚未对齐 Codex 重连展示。",
  ),
  group(
    "history",
    "分页、虚拟化和导航",
    ["ReadThreadTurnList", "ScrollToBottomButton"],
    ["history-pagination", "fork-selected", "B:scroll:"],
    "160 轮分页、虚拟化、点击离屏消息、hover 不滚动；切会话恢复阅读位置；旧分页不能改变新任务；右栏打开不遮挡导航。",
  ),
  group(
    "footer",
    "操作栏",
    ["TurnFooterView"],
    ["footer-real", "fork-selected", "B:copy and fork"],
    "复制、连续点击锁、分支失败反馈；真实分支按指定轮次截断，保留工作区并刷新恢复；操作可键盘触达。",
  ),
  group(
    "queue",
    "排队消息",
    ["QueuedSteersPanel"],
    [
      "D:real running turn",
      "D:real queue:",
      "D:real queued steer apply-now",
      "D:stop pending",
    ],
    "实际 SDK 等待时排队、拖拽排序、菜单 Escape、编辑、单条取消；停止保留队列并显示暂停；继续生成已完成轮次；立即引导中断等待并将排队输入送入新的已完成答复。",
  ),
  group(
    "composer",
    "输入框、附件与菜单",
    [
      "ComposerShell",
      "ComposerAttachmentChips",
      "ComposerSuggestionPopover",
      "SlashCommandPopover",
      "SandboxInstallBanner",
    ],
    [
      "composer-menus",
      "composer-slash",
      "composer-browser",
      "composer-skill",
      "composer-full-access",
    ],
    "文件选择和移除、技能/文件建议、URL 剪贴板、批注分组、菜单关闭、IME 与换行；完全访问确认的焦点环、取消/确认/持久化。",
    "移除全部批注的批量动作按用户限制未执行；只执行单条移除。",
  ),
  group(
    "progress",
    "步骤、上下文和计划入口",
    ["ComposerTaskProgress", "ContextUsageRing", "WorkflowChatCards"],
    ["host-context", "host-task", "host-plan"],
    "上下文三个阈值与键盘提示；步骤进度与失败保留；上下文操作实际回调；计划关闭/修改/执行/新上下文执行。",
    "计划/上下文事件使用真实 IPC 回放；执行入口用缺凭据错误验证收尾，不声称模型执行了计划。创建精简分支当前实际为普通分支，没有摘要压缩。",
  ),
  group(
    "model",
    "模型选择",
    ["WorkflowChatModelSelector"],
    ["composer-model"],
    "禁用模型过滤、切换后持久化、Escape 返回焦点、刷新恢复。",
  ),
  group(
    "styles",
    "Marloues 样式规范与主题",
    [],
    [
      "style-",
      "D:MCP App receives light/dark/warm",
      "B:Markdown error boundary",
    ],
    "局部样式放入相邻 CSS Modules；复用现有 Input/Button、primary 和 icon-button。亮/暗/暖主题下检查实际背景、边框、字体、圆角、焦点、弹窗遮罩、文件行高亮；Mermaid 缩放及减少动态效果下的布局正确；自定义强调色即时更新。错误边界样式及恢复、MCP iframe 草稿连续性另由各自测试层覆盖。",
    "遵循 Marloues 现有规范；未制作 Codex 像素级对比。第三方 iframe 需主动消费宿主提供的标准变量。",
  ),
];
const allCases = [
  ...full.results.map((r) => ({
    id: r.id,
    layer: "electron-replay",
    status: r.status,
  })),
  ...browser.passed.map((id) => ({
    id: "B:" + id,
    layer: "browser-fixture",
    status: "passed",
  })),
  ...desktop.passed.map((id) => ({
    id: "D:" + id,
    layer: "sdk-desktop",
    status: "passed",
  })),
];
for (const g of groups) {
  g.checks = g.patterns.flatMap((p) =>
    allCases.filter((c) => c.id.startsWith(p)),
  );
  if (!g.checks.length) throw Error("No evidence for " + g.id);
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}
const sourceRoot = join(root, "client/renderer/src/components/workflow-chat");
const sourceFiles = [
  ...walk(sourceRoot).filter((p) => p.endsWith(".tsx")),
  ...["WorkflowChatCards", "WorkflowChatModelSelector"].map((n) =>
    join(root, "client/renderer/src/pages", n + ".tsx"),
  ),
  ...["PermissionRequestPanel", "PermissionFilePreview"].map((n) =>
    join(
      root,
      "client/renderer/src/components/workbench/interaction",
      n + ".tsx",
    ),
  ),
];
const sources = sourceFiles.map((path) => {
  const name = basename(path, ".tsx");
  const text = readFileSync(path, "utf8");
  const g = groups.find((g) => g.files.includes(name));
  let classification = g ? "covered-by-listed-checks" : "unclassified";
  let note = "";
  if (path.includes("/fixtures/")) {
    classification = "test-only";
    note = "验收或旧对比页，不计入正式对话组件覆盖。";
  } else if (path.includes("/task-context/") || name === "SubagentWorkspace") {
    classification = "auxiliary-scope";
    note = "任务上下文/子代理辅助区壳不计入正文；其共享正文渲染器另有验证。";
  } else if (
    [
      "ViewportCulling",
      "message-view",
      "ThreadView",
      "WorkflowTurnList",
    ].includes(name)
  ) {
    classification = "compatibility-not-mounted";
    note = "仅遗留导出/fixture 引用，未作为当前主会话入口运行。";
  } else if (name === "ReasoningRow") {
    classification = "hidden-by-contract";
    note =
      "正式过程按 Codex 活动规则过滤 reasoning；不能算作已显示的推理正文。";
  }
  if (classification === "unclassified")
    throw Error("Unclassified source " + path);
  return {
    path: path.slice(root.length + 1),
    exports: [...text.matchAll(/export (?:function|const|class) (\w+)/g)].map(
      (m) => m[1],
    ),
    sha256: createHash("sha256").update(text).digest("hex"),
    classification,
    group: g?.id,
    note,
  };
});
const scenarioGroups = {
  CA01: ["route"],
  CA02: ["route"],
  CA03: ["commands"],
  CA04: ["apps"],
  CA05: ["queue", "media"],
  CA06: ["code"],
  CA07: ["code", "links"],
  CA08: ["mermaid"],
  CA09: ["table"],
  CA10: ["body"],
  CA11: ["body", "errors"],
  CA12: ["links"],
  CA13: ["media"],
  CA14: ["media"],
  CA15: ["user", "markers"],
  CA16: ["user"],
  CA17: ["footer"],
  CA18: ["commands"],
  CA19: ["files"],
  CA20: ["mcp"],
  CA21: ["apps"],
  CA22: ["questions", "permission"],
  CA23: ["progress", "markers"],
  CA24: ["errors"],
  CA25: ["files", "links"],
  CA26: ["body", "markers"],
  CA27: ["history"],
  CA28: ["history", "apps"],
  CA29: ["markers"],
  CA30: ["table", "media"],
  CA31: [],
};
const gaps = {
  CA04: "未实现 Codex 不可折叠 App 策略。",
  CA07: "功能检查通过；流式选区所有边界尚未穷举。",
  CA08: "未穷举语言前缀和所有异步覆盖竞态。",
  CA10: "真实字体/RTL/公式通过，延迟加载中间状态未逐个截取。",
  CA12: "缺少远端宿主集成。",
  CA13: "真实文件媒体失败→换源恢复通过；远端慢速媒体与 default/scrollable 私有模式未穷举。",
  CA14: "已完成画廊和停止回退通过，逐图到达时所有 pending 组合未穷举。",
  CA15: "私有 heartbeat/委派来源缺少完整产品语义。",
  CA16: "按允许的降级明确为放回输入框；不具备附件历史原地编辑能力。普通文件横向标签已做真实布局/键盘检查，PDF/Office 等专用预览及条件文档卡片组尚未接入。",
  CA17: "操作资格、锁、分支失败和真实截断通过；剪贴板系统拒绝权限分支未模拟。",
  CA18: "没有真实脱离轮次的后台进程完成验收。",
  CA19: "无原批次回滚能力；二进制/重命名/跨 cwd 组合未穷举。",
  CA20: "六内容和原始信封通过；超大 raw 性能及跨评审连续调用组合未穷举。",
  CA21: "失败重试和折叠草稿通过；superseded/remote-logo 私有策略未实现。",
  CA22: "通用 kind 回退通过，不能等同八类私有协议均已接入。",
  CA23: "实际进度与已知子任务导航通过；多真实代理并行模型执行未在本套触发。",
  CA24: "缺独立重连次数 UI 与旧重试回调的整机回放。",
  CA25: "无五种 Codex 私有资源宿主。",
  CA26: "无完整 Codex 私有正文指令/heartbeat 协议。",
  CA28: "正文、折叠、iframe 和导航分别通过，未穷举它们的所有并发组合。",
  CA29: "通用显式标记/raw 通过；worktree 两阶段私有事件未全量接入。",
  CA30: "960/1440、亮暗暖主题、实际样式变量、键盘焦点及 reduced-motion 图表布局通过；全部 compact 配置和跨平台尚未穷举。",
};
const acceptance = read(
  "docs/architecture/conversation-area/acceptance.json",
).scenarios.map((s) => ({
  id: s.id,
  title: s.title,
  ruleIds: s.ruleIds,
  status: gaps[s.id] ? "partial" : "passed",
  groups: scenarioGroups[s.id],
  remaining: gaps[s.id] ?? "",
  note:
    s.id === "CA31"
      ? "静态参考校验与动态验收分开记录；不使用组件数量制造对齐百分比。"
      : "",
}));
const unitLog = readFileSync(
  join(root, "client/test-results/conversation-complete/unit.log"),
  "utf8",
);
const unit = {
  files: Number(unitLog.match(/Test Files\s+(\d+) passed/)?.[1]),
  tests: Number(unitLog.match(/Tests\s+(\d+) passed/)?.[1]),
};
if (!unit.tests || /FAIL|failed \(/.test(unitLog))
  throw Error("Unit evidence missing or failed");
const logEvidence = (name) => {
  const path = "client/test-results/conversation-complete/" + name + ".log";
  const content = readFileSync(join(root, path), "utf8");
  return {
    path,
    sha256: createHash("sha256").update(content).digest("hex"),
    content,
  };
};
const typecheckLog = logEvidence("typecheck");
const lintLog = logEvidence("lint-client");
if (
  !typecheckLog.content.includes("typecheck:node") ||
  !typecheckLog.content.includes("typecheck:web") ||
  /error TS\d/.test(typecheckLog.content)
)
  throw Error("Typecheck evidence missing or failed");
if (
  !lintLog.content.includes("eslint --config") ||
  /[1-9]\d* errors?/.test(lintLog.content)
)
  throw Error("Lint evidence missing or failed");
const lintWarnings = Number(lintLog.content.match(/(\d+) warnings?/)?.[1] ?? 0);
const staticChecks = {
  typecheck: {
    status: "passed",
    path: typecheckLog.path,
    sha256: typecheckLog.sha256,
  },
  lintClient: {
    errors: 0,
    warnings: lintWarnings,
    path: lintLog.path,
    sha256: lintLog.sha256,
    note: lintWarnings
      ? "现有 fix-node-pty-permissions.mjs 中 fileURLToPath 未使用警告。"
      : "",
  },
};
const screenshots = full.results.flatMap((result) =>
  (result.evidence ?? []).map((file) => {
    const path = "client/test-results/conversation-complete/" + file;
    if (!existsSync(join(root, path)))
      throw Error("Missing screenshot: " + path);
    return {
      check: result.id,
      file,
      path,
      sha256: createHash("sha256")
        .update(readFileSync(join(root, path)))
        .digest("hex"),
    };
  }),
);
const styleChecks = full.results.filter((result) =>
  result.id.startsWith("style-"),
);
if (styleChecks.length !== 7) throw Error("Missing conversation style checks");
const attachmentChecks = full.results.filter((result) =>
  result.id.startsWith("attachment-layout-"),
);
if (attachmentChecks.length !== 4)
  throw Error("Missing attachment layout checks");
const stylePaths = [
  ...walk(sourceRoot).filter((path) => path.endsWith(".module.css")),
  join(sourceRoot, "content/conversation-theme.ts"),
  join(root, "client/renderer/src/styles/tokens.css"),
  join(root, "client/renderer/src/styles/README.md"),
];
const tokenDefinitions = new Set(
  walk(join(root, "client/renderer/src/styles"))
    .filter((path) => path.endsWith(".css"))
    .flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/(--[\w-]+)\s*:/g)].map(
        (match) => match[1],
      ),
    ),
);
const styleFiles = stylePaths.map((path) => {
  const content = readFileSync(path, "utf8");
  if (
    path.endsWith(".module.css") &&
    /#[\da-f]{3,8}\b|rgba?\(|hsla?\(|--border-color\b|--bg-primary\b/i.test(
      content,
    )
  )
    throw Error("Non-semantic color in conversation CSS Module: " + path);
  if (path.endsWith(".module.css"))
    for (const [, name] of content.matchAll(/var\((--[\w-]+)/g))
      if (!tokenDefinitions.has(name))
        throw Error("Undefined style token " + name + " in " + path);
  return {
    path: path.slice(root.length + 1),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
});
const themeScreenshots = ["light", "dark", "warm"]
  .flatMap((theme) => [
    `client/test-results/conversation-app/mcp-theme-${theme}.png`,
    `client/test-results/conversation-details/error-boundary-${theme}.png`,
  ])
  .map((path) => ({
    path,
    sha256: createHash("sha256")
      .update(readFileSync(join(root, path)))
      .digest("hex"),
  }));
const styleAlignment = {
  themes: ["light", "dark", "warm"],
  moduleCount: styleFiles.filter(({ path }) => path.endsWith(".module.css"))
    .length,
  files: styleFiles,
  checks: styleChecks.map(({ id }) => id),
  screenshots: [
    ...screenshots.filter(({ check }) => check.startsWith("style-")),
    ...themeScreenshots,
  ],
};
const report = {
  schemaVersion: 2,
  recordedAt: new Date().toISOString(),
  scope: "当前 Marloues 对话区组件及列明交互；不声称 Codex 私有状态全量等价",
  worktree: root,
  branch: execFileSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  unit,
  staticChecks,
  styleAlignment,
  screenshots,
  build,
  full,
  browser: {
    ...browser,
    evidence: "client/test-results/conversation-details/results.json",
  },
  desktop: {
    passed: desktop.passed,
    success: desktop.success,
    errors: desktop.errors,
    build: desktop.build,
    evidence: "client/test-results/conversation-app/results.json",
  },
  live: {
    passed: live.passed,
    success: live.success,
    liveModel: live.liveModel,
    build: live.build,
    evidence: "client/test-results/conversation-app-live/results.json",
  },
  groups,
  sources,
  acceptance,
};
writeFileSync(
  join(
    root,
    "docs/architecture/conversation-area/implementation-verification.json",
  ),
  JSON.stringify(report, null, 2) + "\n",
);
writeFileSync(
  join(root, "docs/architecture/conversation-area/acceptance-execution.json"),
  JSON.stringify(
    {
      recordedAt: report.recordedAt,
      kind: "Actual execution ledger; original acceptance.json remains a historical plan",
      scenarios: acceptance,
    },
    null,
    2,
  ) + "\n",
);
const md = [
  "# 对话区组件与交互验收",
  "",
  `时间：${report.recordedAt}。工作树：\`${root}\`，分支：\`${report.branch}\`。`,
  "",
  `本次生产 Electron 回放 **${full.scenes} 个场景、${full.results.length} 项检查通过**；真实 SDK / MCP 桌面流程 **${desktop.passed.length} 项通过**；浏览器组件交互 **${browser.passed.length} 项通过**；真实模型 **${live.passed.length} 项通过**；单元测试 **${unit.files} 文件 / ${unit.tests} 项通过**。`,
  `Node/Web 类型检查及 main/preload/renderer 生产构建通过；client lint 0 错误、${lintWarnings} 个警告。三个桌面测试结果的 build 路径与当前构建相同。`,
  "",
  "这些数字表示已执行检查，不表示所有 Codex 私有状态均已对齐。下面逐类写出已验证动作和仍存在的边界；源文件清单只用于防漏，不以文件数量冒充组件覆盖率。",
  "",
  "## 验证层与证据",
  "",
  `- Electron 回放：${full.scenes} 个隔离保存的会话，经真实 main/preload/IPC、持久化和正式页面渲染；每个工具的内部详情也展开并记录。计时和稀有通知采用主进程受控快照发送，区别于模型执行验证。`,
  "- SDK 桌面：普通输入框 → 真实 SDK 进程 → 本地确定性 Anthropic 协议服务 → Read/MCP/表单/iframe/停止队列 → 持久化 → 完整重启。协议服务不等同真实模型。",
  `- 真实模型：使用保存的 \`${live.liveModel}\` 配置和系统凭据后端，真正读取验收文件后在正文回答。`,
  "- 浏览器 fixture：用于流式 DOM、精确竞态和故意触发 renderer 异常；此层的文件/分支回调是 fixture，未冒充真实宿主。",
  "- [机器记录](implementation-verification.json)、[原 31 场景执行账本](acceptance-execution.json)、[生产 Electron 检查](../../../client/test-results/conversation-complete/results.json)、[SDK 桌面](../../../client/test-results/conversation-app/results.json)、[浏览器](../../../client/test-results/conversation-details/results.json)、[真实模型](../../../client/test-results/conversation-app-live/results.json)。",
  "- [样式规范对齐记录](style-alignment.md)：组件归属、主题变量、控件复用、三主题截图及验证边界。",
  "- [附件排列规则复核](attachment-layout.md)：资源包条件、横向条与纵向卡片的区别、重叠/顺序/焦点滚动修复及专用文档预览差距。",
  `- [截图与检查索引](../../../client/test-results/conversation-complete/index.html)：本轮 ${screenshots.length} 张截图，每张关联具体通过的检查并记录 SHA-256；没有混入历史失败截图。自动检查包括实际布局、控件可见性、焦点、剪贴板和操作结果；截图不是像素级 Codex 对比基准。`,
  "",
  "## 组件与交互清单",
  "",
  "| 组件类别 | 本次实际验证 | 尚存边界 |",
  "| --- | --- | --- |",
  ...groups.map(
    (g) =>
      `| ${g.title} | ${g.behavior}（${g.checks
        .map((c) => "`" + c.id + "`")
        .slice(0, 4)
        .join(
          "、",
        )}${g.checks.length > 4 ? " 等" : ""}） | ${g.boundary || "列明动作通过。"} |`,
  ),
  "",
  "## 本轮修复的实际问题",
  "",
  "1. 隔离 app home 在 store 单例导入时尚未生效，会读到其他实例配置。",
  "2. 拒绝/停止的文件编辑被过滤，工具组仍报已编辑；协作失败显示已创建。",
  "3. 命令缺少退出码、独立用时与截断信息；单工具取消失败无可见反馈。",
  "4. 错误 additionalDetails 在历史恢复时丢失，失败轮次隐藏已完成文件。",
  "5. 分支丢失旧历史与工作区；现在按选定轮次截断并持久化。",
  "6. 翻页只反复读取前 100 轮，快照更新丢旧页；页面旧吸底 effect 覆盖阅读位置恢复；右栏遮挡消息导航。",
  "7. 队列菜单被滚动裁切；停止后 durable 队列没有发布暂停状态。",
  "8. 权限模式弹窗未接管和约束键盘焦点；普通菜单缺 Escape。",
  "9. 计划确认卡被输入框遮挡，现接入输入框 dock 高度预留。",
  "10. 粘贴技能/文件引用时光标状态落后；Escape 后 keyup 和负索引重新打开建议。",
  "11. 新增组件混入临时颜色、未定义变量和全局 CSS；现拆为相邻 CSS Modules 并接入现有主题与控件。主按钮使用现有 primary 样式的成对前景/背景色。",
  "12. 减少动态效果的全局过渡影响 Mermaid 临时 SVG 尺寸测量，出现巨大留白、节点缩小和裁切；现在隔离测量样式，并检查三个节点的尺寸和边界。",
  "13. MCP iframe 和 Mermaid 未跟随完整主题变量变化；现在读取 Marloues 实际主题并发送标准 MCP Apps 上下文更新，保留 iframe 草稿。",
  "14. 附件顺序反转、文件标签内部 inline 布局导致重叠、名称重复；修复滚动容器与标签布局，Tab 会显露完整控件。新增真实坐标与键盘检查，防止仅断言能显示/能点击而漏掉布局问题。",
  "",
  "## 原 Codex 场景的验收状态",
  "",
  "| 编号 | 场景 | 状态 | 仍缺少的部分 |",
  "| --- | --- | --- | --- |",
  ...acceptance.map(
    (s) =>
      `| ${s.id} | ${s.title} | ${s.status === "passed" ? "列明步骤通过" : "部分验证"} | ${s.remaining || s.note || "见对应动态检查。"} |`,
  ),
  "",
  "## 完整源文件索引",
  "",
  "以下导出符号是代码导航索引，含组合组件和辅助函数。归类不等于每个可选参数的所有组合都已执行。",
  "",
  "| 文件 | 归类 | 对应检查组/说明 |",
  "| --- | --- | --- |",
  ...sources.map(
    (s) =>
      `| [${s.path.split("/").slice(-2).join("/")}](${"../../../" + s.path}) | ${s.classification} | ${s.group || s.note} |`,
  ),
  "",
  "## 复跑",
  "",
  "在此 worktree 中依次执行：",
  "",
  "```sh",
  "npm run test:conversation:build",
  "npm run test:conversation:complete",
  "npm run test:conversation:desktop",
  "npm run test:conversation:live",
  "npm run test:conversation:visual",
  "npm run typecheck",
  "npm run test:unit",
  "npm run lint:client",
  "node docs/architecture/conversation-area/verify.mjs --reference-only",
  "npm run test:conversation:report",
  "```",
  "",
  "浏览器测试先用 npm run test:conversation:preview 启动 5191 上的 Vite 对话 fixture，脚本固定在 client 工作区运行以正确生成 Tailwind 控件样式；可通过 MARLOUES_CHROMIUM_PATH 指定 Chromium。UI 测试顺序运行，避免共享系统剪贴板造成相互干扰。报告生成器拒绝将 QA_FILTER 的局部结果当作完整回放；历史失败图片保留，当前结论只取 results.json 中本轮记录。",
  "",
  "批量删除动作未执行；未合并分支、覆盖安装版或发布。Windows/Linux、所有私有资源服务和所有并发组合仍不在已通过证明内。",
  "",
];
const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
writeFileSync(
  join(root, "client/test-results/conversation-complete/index.html"),
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>对话区实际验收证据</title><style>body{font:16px system-ui;margin:32px;background:#f6f7f9;color:#1b2230}header{max-width:960px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px}figure{margin:0;background:white;border:1px solid #ddd;border-radius:8px;padding:12px}img{width:100%;height:auto}figcaption{overflow-wrap:anywhere;font-size:13px;line-height:1.6}input{padding:10px;width:min(90%,620px);margin:20px 0}a{color:#2456a6}</style><header><h1>对话区实际验收证据</h1><p>${full.scenes} 个场景 · ${full.results.length} 项检查 · ${screenshots.length} 张截图</p><p>本轮生产 Electron 的实际截图。点击原图查看细节。这里只列本轮通过检查的截图，不包含历史失败图片；完整边界见<a href="../../../docs/architecture/conversation-area/full-verification.md">验收报告</a>。</p><input id="filter" aria-label="按检查或文件名筛选" placeholder="筛选 command、mcp、timing、permission…"></header><main>${screenshots.map((s) => `<figure data-search="${escapeHtml(s.check + " " + s.file)}"><a href="${escapeHtml(s.file)}" target="_blank"><img loading="lazy" src="${escapeHtml(s.file)}" alt="${escapeHtml(s.check)}"></a><figcaption><strong>${escapeHtml(s.check)}</strong><br>${escapeHtml(s.file)}</figcaption></figure>`).join("")}</main><script>document.getElementById('filter').addEventListener('input',event=>{const value=event.target.value.toLowerCase();for(const card of document.querySelectorAll('figure'))card.hidden=!card.dataset.search.toLowerCase().includes(value)})</script></html>`,
);
writeFileSync(
  join(root, "docs/architecture/conversation-area/full-verification.md"),
  md.join("\n"),
);
writeFileSync(
  join(root, "docs/architecture/conversation-area/style-alignment.md"),
  [
    "# 对话区样式规范对齐",
    "",
    `时间：${report.recordedAt}。工作树：\`${root}\`；分支：\`${report.branch}\`。`,
    "",
    "以 [Renderer CSS Architecture](../../../client/renderer/src/styles/README.md) 和 [tokens.css](../../../client/renderer/src/styles/tokens.css) 为准。对话行为参考 Codex，视觉继续使用 Marloues 的设计规范。",
    "",
    "## 实际修改",
    "",
    `- 将新增局部样式收进 **${styleAlignment.moduleCount} 个相邻 CSS Modules**，从 markdown.css / workflow-activity.css 移出相应规则；共享命令元信息和消息操作规则回到原有 owner 文件。保留已有 workflow-* 语义类和测试入口。`,
    "- 颜色使用 surface-workspace / surface-popover / raised-1、text-1/2/3、border、accent/soft、danger；间距、字号、圆角、阴影和遮罩使用现有变量。移除临时十六进制颜色和未定义的 --border-color / --bg-primary。几何上限和原生控件高度保留为布局值。",
    "- 问答输入复用 Input，提交/重试/许可等复用 Button，主操作复用现有 primary，图标操作复用 icon-button。亮色主按钮使用成对的 --primary-fill / --primary-ink。原生 select、checkbox、音视频继续保留原生交互。",
    "- 补充 npm run test:conversation:preview 启动入口，固定在 client 工作区加载 Tailwind 内容扫描。修复从仓库根目录直接启动 Vite 时预览页缺少控件样式的问题；浏览器测试断言重试按钮的实际高度和边框。",
    "- Mermaid 消费实际字体、背景和强调色；临时测量容器局部禁用过渡，解决减少动态效果时 2000px 旧尺寸造成的节点缩小、裁切和巨大留白。",
    "- MCP Apps 的初始化及 ui/notifications/host-context-changed 通知传递标准语义变量；warm 对应协议 light 并传递实际暖色值。主题/强调色切换保留已挂载 iframe 和草稿。",
    "- 用户附件条使用 UserMessage.module.css：文件控件整体 flex 布局，图标/文件名/行号不重叠；外层从右端滚动，内层保留顺序，键盘聚焦时完整显示。条件文档卡片尚有差距，见 [规则复核](attachment-layout.md)。",
    "",
    "## 组件样式归属",
    "",
    "| 文件 | 当前源码 |",
    "| --- | --- |",
    ...styleFiles
      .filter(({ path }) => path.endsWith(".module.css"))
      .map(
        ({ path }) =>
          `| ${basename(path)} | [${path.split("/").slice(-2).join("/")}](${"../../../" + path}) |`,
      ),
    "",
    "主题桥接：[conversation-theme.ts](../../../client/renderer/src/components/workflow-chat/content/conversation-theme.ts)。CSS、主题桥接和规范文件的 SHA-256 记录在 [机器证据](implementation-verification.json) 的 styleAlignment 中。",
    "",
    "## 验证与截图",
    "",
    `- 正式 Electron **${styleChecks.length} 项样式检查**：亮/暗/暖主题的实际背景、边框、字号、圆角、字体、键盘焦点、主按钮前景背景、弹窗遮罩/阴影、文件目标行；图表三个节点完整、标签可读、尺寸合理；自定义强调色即时生效。`,
    "- SDK / MCP：真实 stdio 资源和 iframe 握手后切换三主题及强调色，断言主题变量送达且草稿保留，再继续真实批准/拒绝工具流程。",
    "- 浏览器 fixture：三主题下断言错误边界的计算样式；重试和正文标识更新仍能恢复。",
    `- 附件布局另有 ${attachmentChecks.length} 项生产 Electron 检查：三主题 × 两种宽度的原截图组合/长名称/多图实际坐标，以及键盘滚动、文件预览目标行、焦点返回；截图文件以 attachment- 开头。`,
    `- 完整回归：生产 Electron ${full.results.length} 项、SDK / MCP ${desktop.passed.length} 项、浏览器 ${browser.passed.length} 项、真实模型 ${live.passed.length} 项；单元 ${unit.tests} 项。类型检查和生产构建通过；lint 0 错误，${lintWarnings} 个现有警告。`,
    "",
    "| 主题 | 问答卡 | 图表 | 弹窗 | 文件预览 | MCP App | 错误恢复 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...["light", "dark", "warm"].map(
      (theme) =>
        `| ${theme} | [截图](../../../client/test-results/conversation-complete/style-question-${theme}.png) | [截图](../../../client/test-results/conversation-complete/style-mermaid-${theme}.png) | [截图](../../../client/test-results/conversation-complete/style-dialog-${theme}.png) | [截图](../../../client/test-results/conversation-complete/style-file-preview-${theme}.png) | [截图](../../../client/test-results/conversation-app/mcp-theme-${theme}.png) | [截图](../../../client/test-results/conversation-details/error-boundary-${theme}.png) |`,
    ),
    "",
    "截图来自运行中的正式 Electron 或标明的浏览器错误 fixture；计算样式与实际交互有自动断言，检查了代表性截图。没有把这些截图称为 Codex 像素级对比，也没有声称逐像素人工审阅了所有截图。第三方 iframe 需要主动使用标准变量，宿主不能强制改写任意外部应用内部样式。跨平台、全部 compact 配置仍未穷举。",
    "",
    "完整检查 ID、执行层和保留差异见 [完整验收报告](full-verification.md)。报告仅在完整回放、同一构建的 SDK/真实模型及浏览器检查通过后生成。",
    "",
  ].join("\n"),
);
console.log(
  JSON.stringify({
    checks: full.results.length,
    scenes: full.scenes,
    groups: groups.length,
    sourceFiles: sources.length,
    referenceScenarios: acceptance.length,
    report: "docs/architecture/conversation-area/full-verification.md",
  }),
);
