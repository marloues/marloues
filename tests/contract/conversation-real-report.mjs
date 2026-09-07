/** Pair observations from the installed Codex app with production Marloues checks. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "../..");
const artifacts = join(root, "client/test-results/conversation-real");
const read = (file) => JSON.parse(readFileSync(join(artifacts, file), "utf8"));
const result = read("results.json");
const audit = read("audit.json");
const screenshots = read("screenshots.json");
const native = read("native-comparison.json");
const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
if (
  hash(result.frozenSource) !== result.sourceSha256 ||
  native.sourceSha256 !== result.sourceSha256
)
  throw new Error(
    "Frozen source and native comparison must refer to the same log",
  );
for (const shot of [...screenshots, ...native.files])
  if (hash(join(artifacts, shot.file)) !== shot.sha256)
    throw new Error("Evidence changed after verification: " + shot.file);
const regression = JSON.parse(
  readFileSync(
    join(root, "client/test-results/conversation-complete/results.json"),
    "utf8",
  ),
);
const passCount = (rows) =>
  rows.filter((row) => row.status === "passed").length;
const passed = passCount(result.results);
const regressionValid =
  regression.build === result.build &&
  regression.results.at(-1)?.id === "no-uncaught-renderer-errors" &&
  regression.results.filter((row) => row.id.startsWith("render-")).length ===
    regression.scenes - 1;
const regressionLabel = regressionValid
  ? `${passCount(regression.results)}/${regression.results.length} 项，${regression.scenes} 个场景（同一构建）`
  : "没有同一构建的完整回归记录，不能沿用旧结论";
const checked = (observation) =>
  result.results.find((row) => row.id === observation.check)?.status ===
  "passed";
const matched = native.observations.filter(checked).length;
const names = {
  "canonical-source-through-production-ipc":
    "真实事件经过正式 IPC 后的身份、类型、顺序与阶段",
  "recorded-checkpoint-attachment-input":
    "附件输入时点；一张图片，无重复文件标签",
  "recorded-checkpoint-attachment-process": "执行过程时点",
  "recorded-checkpoint-attachment-answer": "最终回答已记录时点",
  "recorded-checkpoint-attachment-complete": "任务完成时点",
  "recorded-checkpoint-short-complete": "较短任务的完成状态",
  "real-attachment-preview-focus-and-widths":
    "1440 / 960 宽度的图片解码、预览、Escape 焦点及溢出",
  "recorded-clock-frozen-and-placement":
    "历史时钟固定；14分34秒；展开后用时仍在过程上方",
  "real-inspected-image-groups-and-result-placement":
    "图片归入过程、分组展开、预览切换边界、关闭及嵌套状态重置",
  "read-only-import-rejects-execution": "回放拒绝发送，渲染无异常",
};
const types = Object.entries(
  audit.items.reduce((all, item) => {
    all[item.mappedType] = (all[item.mappedType] || 0) + 1;
    return all;
  }, {}),
);
const questionRecords = audit.items.filter((item) =>
  item.retainedInSourceFields.includes("questions"),
).length;
const gaps = [
  ...native.notYetMatched,
  "JSONL 主要记录完成的 item。记录时点的状态重建无法恢复未记录的逐 token 增量、历史 hover、点击和滚动；运行中时点只显示已记录内容。",
  `${questionRecords} 条 AgentMessage 带有 questions；目前呈现日志内题目和选项文本，尚未映射 Codex 异步问题卡交互状态。`,
  "parsed_cmd 尚未用于命令摘要，当前沿用 Marloues 命令分类；MCP 的 pluginId / readOnlyHint 尚未用于呈现。stdout / stderr 分流仍保留在源文件，显示使用 aggregated_output。",
  `本日志包含 ${types.length} 类结构化 item，不能因此宣称覆盖权限等待、动态工具、图像生成、协作代理、专用 PDF / Office 卡片等全部情况；合成场景回归不能替代这些类型的真实 Codex 对照。`,
];
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const picture = (file, label) =>
  `<figure><figcaption>${esc(label)}</figcaption><a href="${esc(file)}" target="_blank"><img loading="lazy" src="${esc(file)}" alt="${esc(label)}"></a><small>${esc(file)}</small></figure>`;
const nativeCards = native.observations
  .map(
    (observation, index) =>
      `<article id="native-${esc(observation.id)}"><h3>${index + 1}. ${esc(observation.rule)}</h3><p class="${checked(observation) ? "ok" : "bad"}">${checked(observation) ? "Codex 实测已记录；Marloues 对应检查通过" : "Marloues 对应检查尚未通过"}</p><div class="pair">${picture(observation.native[0], "Codex · 原任务实际窗口")}${picture(observation.marloues[0], "Marloues · 同源日志正式 App")}</div><p>${(observation.nativeAx || []).map((file) => `<a href="${esc(file)}">${esc(file)}</a>`).join(" · ")}</p>${
        observation.native.length > 1
          ? `<details><summary>原生操作后续截图</summary>${observation.native
              .slice(1)
              .map((file) => picture(file, "Codex · 操作结果"))
              .join("")}</details>`
          : ""
      }</article>`,
  )
  .join("");
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Codex ↔ Marloues 真实对话对照</title>
<style>body{font:15px/1.7 system-ui,sans-serif;background:#f6f6f5;color:#262626;margin:0}main{max-width:1300px;margin:32px auto;padding:0 24px}h1{font-size:28px}h2{font-size:21px;margin-top:32px}h3{font-size:17px}a{color:#145baf}code{word-break:break-all;font-size:12px}.notice,article,details{background:white;border:1px solid #ddd;border-radius:12px;padding:16px 20px;margin:16px 0}.notice{border-left:4px solid #2b7650}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}img{display:block;width:100%;height:auto;border:1px solid #ddd;border-radius:8px}nav{display:flex;flex-wrap:wrap;gap:16px}.ok{color:#216d3f}.bad{color:#a03535}small{color:#666;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:600}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;min-width:0}figcaption{font-weight:600;margin-bottom:8px}li{margin:8px 0}pre{overflow:auto}@media(max-width:800px){.pair{grid-template-columns:1fr}main{padding:0 12px}}</style>
<main><h1>Codex ↔ Marloues：真实会话对话区</h1><p>${esc(result.recordedAt)} · codex/architecture-review-20260905</p>
<div class="notice"><strong>原生实测 ${native.observations.length} 条规则，Marloues 对应通过 ${matched} 条；真实日志回放 ${passed}/${result.results.length}。</strong><p>已操作安装的 Codex ${esc(native.app.version)}，定位同一条附件消息，保存展开、图片预览、方向键、Escape 和再次展开的结果。下方左右截图来自两个实际 App。仍有明确差距，未宣称所有组件与交互已对齐。</p></div>
<nav><a href="#native">两端实测对照</a><a href="#checks">自动验证</a><a href="#gaps">未对齐项目</a><a href="#checkpoints">记录时点</a><a href="native-comparison.json">原生证据</a><a href="audit.json">日志行号审计</a></nav>
<h2 id="native">同一条消息、同一图片、对应操作</h2><p>原轮次 <code>${esc(native.sourceTurnId)}</code>，完成记录第 ${native.sourceCompletedLine} 行。Codex 对话列约 ${native.capture.codexConversationWidthCssPx}px，Marloues 约 ${native.capture.marlouesConversationWidthCssPx}px；全窗尺寸和主题不同。点击截图可查看原图。本对照判断显示和操作规则，未作全窗像素一致性判断。</p>${nativeCards}
<h2 id="checks">自动验证</h2><p>对话区回归：${esc(regressionLabel)}。真实日志检查如下：</p><table><tr><th>检查</th><th>结果</th></tr>${result.results.map((row) => `<tr><td>${esc(names[row.id] || row.id)}</td><td class="${row.status === "passed" ? "ok" : "bad"}">${row.status === "passed" ? "通过" : "失败"}</td></tr>`).join("")}</table>
<h2 id="gaps">未对齐与未覆盖的边界</h2><ol>${gaps.map((gap) => `<li>${esc(gap)}</li>`).join("")}</ol>
<h2>数据证据</h2><p>源任务 <code>${esc(result.sourceThreadId)}</code>；截止第 ${result.sourceThroughLine} 行。${result.coverage.turns} 个显示片段，${result.coverage.canonicalRecords} 条结构化事件。</p><p>冻结文件 SHA-256：<code>${esc(result.sourceSha256)}</code>。原生截图、AX 状态和 Marloues 截图已保存哈希；报告生成时重新核对。</p><p>事件类型未识别 ${result.coverage.unknown.length}；已检查的用户内容类型未支持 ${result.coverage.unsupportedContent.length}；无效行 ${audit.invalidLines.length}；缺失最终回答 ${audit.missingTerminalItems.length}。这些数字不表示所有嵌套字段和 UI 状态都已适配。</p>
<details><summary>${types.length} 类事件与保留字段</summary><table>${types.map(([type, count]) => `<tr><td>${esc(type)}</td><td>${count}</td></tr>`).join("")}</table><p>只保留于原日志的顶层字段：<code>${esc(result.coverage.retainedInSourceFields.join(", "))}</code>。raw_content 属于非展示内容，不送入回放界面。</p></details>
<h2 id="checkpoints">回放入口</h2><table><tr><th>会话</th><th>截止行号</th><th>原轮次</th></tr>${result.checkpoints.map((point) => `<tr><td>${esc(point.title)}</td><td>${point.throughLine}</td><td><code>${esc(point.turnId || "全部已完成历史")}</code></td></tr>`).join("")}</table>
<details><summary>全部 Marloues 实际截图</summary>${screenshots.map((shot) => `<article><h3>${esc(names[shot.check] || shot.check)}</h3>${picture(shot.file, shot.file)}</article>`).join("")}</details>
<details><summary>复现与环境</summary><pre><code>npm run test:conversation:build
npm run test:conversation:real
npm run test:conversation:complete
npm run test:conversation:real:report
npm run test:conversation:real -- --open</code></pre><p>复用冻结日志；新日志可传 --source /absolute/path/to/rollout.jsonl。原生基线必须另外操作 Codex 采集，不能由 JSONL 推造。</p><p>构建：<code>${esc(result.build)}</code></p><p>回放目录：<code>${esc(result.home)}</code>。独立数据目录，通过正式 IPC 读取；回放只读，不调用模型。--open 保持检查通过后的 App 打开。</p><p>原自动化服务在 macOS 13.4 上因动态库缺失启动失败；用户授予辅助功能后，已改用系统 AX API 完成原生操作。<a href="native-access.json">环境记录</a>。</p></details></main></html>`;
writeFileSync(join(artifacts, "index.html"), html);
const relativeArtifacts = "../../../client/test-results/conversation-real";
const markdown = `# Codex 与 Marloues 真实对话区对照

${result.recordedAt}，分支 \`codex/architecture-review-20260905\`。

已把真实 JSONL 接入正式 Electron 的 main → preload/IPC → ReadThreadTurnList → TurnView，并实际操作 Codex ${native.app.version} 中同一条附件消息。原生实测 **${native.observations.length} 条规则**，Marloues 对应通过 **${matched} 条**。真实回放 **${passed}/${result.results.length}**，完整对话区回归 **${regressionLabel}**。这不代表全部组件和交互已对齐。

[两端截图与逐项结果](${relativeArtifacts}/index.html) · [原生操作证据](${relativeArtifacts}/native-comparison.json) · [回放检查](${relativeArtifacts}/results.json) · [源事件审计](${relativeArtifacts}/audit.json)

## 这轮按原生实测修正的规则

${native.observations.map((entry) => `- ${entry.rule} 对应检查：\`${entry.check}\`，${checked(entry) ? "通过" : "未通过"}。`).join("\n")}

另外修复多文件传输清单只提取首个文件的问题；上传图片的传输引用去重不影响明确文件引用，也不修改协议中图片顺序。

## 对照范围

- 原任务：\`${result.sourceThreadId}\`，原轮次：\`${native.sourceTurnId}\`，完成记录第 ${native.sourceCompletedLine} 行。
- 冻结文件：\`${result.frozenSource}\`；SHA-256：\`${result.sourceSha256}\`；读取截至第 ${result.sourceThroughLine} 行。
- ${result.coverage.turns} 个显示片段、${result.coverage.canonicalRecords} 条结构化事件、${types.length} 类 item；此数量不是组件数。
- 未识别 item ${result.coverage.unknown.length}、已检查内容未支持 ${result.coverage.unsupportedContent.length}、无效行 ${audit.invalidLines.length}、缺失最终回答 ${audit.missingTerminalItems.length}。这些审计不证明全部嵌套字段已被解释。
- Codex 对话列约 737px，Marloues 约 736px；完整窗口和主题不同，不作全窗像素相等声明。
- Codex 截图和 AX 状态来自实际窗口，报告核对证据哈希；未伪造历史 token 或 UI 操作。

## 仍未对齐或覆盖

${gaps.map((gap) => `- ${gap}`).join("\n")}

## 复现

运行 \`npm run test:conversation:build\`、\`npm run test:conversation:real\`、\`npm run test:conversation:complete\`、\`npm run test:conversation:real:report\`。最后加 \`npm run test:conversation:real -- --open\` 保留实际 App 供检查。新日志可传 --source；原生基线需重新操作对应 Codex 消息采集。

构建：\`${result.build}\`；回放目录：\`${result.home}\`。回放只读，使用独立数据目录，源日志不变。
`;
writeFileSync(
  join(root, "docs/architecture/conversation-area/real-jsonl-comparison.md"),
  markdown,
);
console.log(
  JSON.stringify({
    passed,
    total: result.results.length,
    nativeRules: native.observations.length,
    matched,
    regression: regressionLabel,
    report: join(artifacts, "index.html"),
  }),
);
