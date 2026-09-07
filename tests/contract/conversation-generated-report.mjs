/** Report actual Codex tasks derived from the existing fixture cases. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "../..");
const base = join(root, "client/test-results/conversation-generated");
const read = (file) => JSON.parse(readFileSync(join(base, file), "utf8"));
const plan = read("case-plan.json");
const native = read("native-comparison.json");
const hash = (file) =>
  createHash("sha256")
    .update(readFileSync(join(base, file)))
    .digest("hex");
if (native.threadId !== plan.threadId)
  throw new Error("The native evidence belongs to another Codex task");
for (const evidence of native.files)
  if (hash(evidence.file) !== evidence.sha256)
    throw new Error("Evidence changed after capture: " + evidence.file);
const runs = Object.entries(native.runs).map(([path, sourceSha256]) => {
  const result = read(path + "/results.json");
  const interactions = read(path + "/interaction-results.json");
  const snapshot = read(path + "/snapshot.json");
  if (
    hash(path + "/source.jsonl") !== sourceSha256 ||
    result.sourceSha256 !== sourceSha256 ||
    interactions.sourceSha256 !== sourceSha256 ||
    result.sourceThreadId !== plan.threadId ||
    snapshot.turns.length !== 1 ||
    snapshot.turns[0].id !== result.sourceTurnId
  )
    throw new Error("Source identity mismatch: " + path);
  const turn = snapshot.turns[0];
  return {
    path,
    result,
    interactions,
    input: turn.items
      .filter((i) => i.type === "userMessage")
      .flatMap((i) => i.content.filter((p) => p.type === "text"))
      .map((p) => p.text)
      .join("\n\n"),
    answer: turn.items
      .filter((i) => i.type === "agentMessage" && i.phase === "final_answer")
      .map((i) => i.text)
      .join("\n\n"),
  };
});
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const link = (file, label) => `<a href="${esc(file)}">${esc(label)}</a>`;
const picture = (file, label) =>
  `<figure><figcaption>${esc(label)}</figcaption><a href="${esc(file)}" target="_blank"><img src="${esc(file)}" alt="${esc(label)}"></a></figure>`;
const status = (value) =>
  ({
    difference: "已发现差异",
    operated: "已实际操作",
    matched: "内容一致",
    "interaction-verified": "已实际操作",
    "compared-with-differences": "已有对照，仍有差异",
    "partially-compared": "已部分对照",
    pending: "未开始原生对照",
    passed: "通过",
    failed: "失败",
  })[value] || value;
const pending = plan.cases.filter((c) => c.status === "pending").length;
const started = plan.cases.length - pending;
const checks = runs.flatMap((r) => r.result.checks);
const passed = checks.filter((c) => c.status === "passed").length;
const cards = native.observations
  .map((o) => {
    const caseEntry = plan.cases.find((c) => c.id === o.caseId);
    if (!caseEntry?.sourceTurnId) throw new Error("Unmapped case: " + o.caseId);
    return `<article id="${esc(o.id)}" data-status="${esc(o.status)}"><div class="card-heading"><h2>${esc(o.title)}</h2><span class="badge ${o.status === "difference" ? "difference" : "operated"}">${status(o.status)}</span></div><p>${esc(o.detail)}</p><p class="meta">${esc(o.caseId)} · 轮次 ${esc(caseEntry.sourceTurnId)}</p><div class="pair">${picture(o.native, "Codex · 新任务实际窗口")}${picture(o.marloues, "Marloues · 同一条消息，正式 App")}</div><p>${link(o.ax, "Codex 原生控件状态")}</p></article>`;
  })
  .join("");
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>现有用例 → Codex 实际任务 → Marloues 对照</title>
<style>
:root{color-scheme:light;font-family:system-ui,sans-serif;color:#252725;background:#f4f5f2}*{box-sizing:border-box}body{margin:0;line-height:1.7}main{max-width:1500px;padding:32px;margin:auto}h1{font-size:30px;line-height:1.35;margin:0 0 14px}h2{font-size:20px;margin:0}p{margin:12px 0}a{color:#2259a0}header,article,.panel{background:#fff;border:1px solid #dbded6;border-radius:14px;padding:24px;margin:0 0 22px}.eyebrow{font-size:12px;font-weight:700;color:#55634c;letter-spacing:.12em}.meta,small{color:#697064;font-size:12px;overflow-wrap:anywhere}.stats{display:flex;flex-wrap:wrap;gap:28px;border-top:1px solid #e5e7e1;margin-top:20px;padding-top:16px}.stats b{font-size:26px;margin-right:6px}.badge{font-size:12px;border-radius:20px;padding:3px 12px;white-space:nowrap}.difference{background:#fff0dc;color:#87500c}.operated{background:#eaf0fa;color:#244b86}.card-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;min-width:0}figcaption{font-size:13px;font-weight:600;padding:8px 0}img{display:block;width:100%;height:auto;border:1px solid #ddd;border-radius:8px}nav{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0}nav a,button{font:inherit;border:1px solid #d4d9ce;padding:6px 14px;border-radius:8px;background:#fff;color:#343e2e;cursor:pointer;text-decoration:none}button[aria-pressed=true]{background:#344631;color:#fff}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border-bottom:1px solid #e5e7e1;vertical-align:top}th{font-size:13px;color:#60685c}code{font-size:12px;overflow-wrap:anywhere}pre{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f7f3;padding:16px;border-radius:8px}details{margin:12px 0}summary{cursor:pointer;font-weight:600}.table-wrap{overflow:auto}article[hidden]{display:none}.scope{border-left:3px solid #b57920;padding-left:16px}@media(max-width:850px){main{padding:16px}.pair{grid-template-columns:1fr}.card-heading{align-items:flex-start}h1{font-size:24px}header,article,.panel{padding:16px}}
</style></head><body><main>
<header><p class="eyebrow">对话区 · 按现有测试用例现场执行</p><h1>在 Codex 发任务，拿同一份消息对照 Marloues</h1><p>输入取自 <code>${esc(plan.source)}</code> 的现有场景，实际从 Codex 输入框发送。将新生成 JSONL 的对应轮次导入正式 Marloues，再对两边的同一条消息操作、截图。</p><div class="stats"><span><b>${runs.length}</b>轮实际执行</span><span><b>${started}</b>个关联用例</span><span><b>${native.observations.length}</b>组双侧截图</span><span><b>${pending}</b>个用例未开始</span></div><p class="scope">本批已有多处差异，尚未全量对齐。关联用例中的 Markdown、文件变更和专用工具详情也有未测子项。${passed}/${checks.length} 项数据导入与渲染检查通过，不表示 UI 一致性通过。</p><p class="meta">Codex ${esc(native.app.version)} · 分支 codex/architecture-review-20260905 · ${esc(native.recordedAt)}<br>真实任务：Codex 与 Marloues 现场渲染对照 · ${esc(plan.threadId)}</p></header>
<nav><a href="#comparisons">两边对照</a><a href="#tasks">实际输入与输出</a><a href="#coverage">41 个用例进度</a><a href="#evidence">验证与复现</a></nav>
<section id="comparisons"><div class="panel"><h2>同一条消息，对应操作</h2><p>左侧来自安装的 Codex 实际窗口，右侧来自 Marloues 正式 Electron。主题、字体和窗口尺寸保留两款 App 各自设置；这里对照内容和行为，不作全窗像素相等判断。点击图片可打开原图。</p><button data-filter="all" aria-pressed="true">全部对照</button> <button data-filter="difference" aria-pressed="false">只看差异</button></div>${cards}</section>
<section id="tasks" class="panel"><h2>确实发送了什么，Codex 实际返回了什么</h2><p>以下文本直接来自冻结日志的对应轮次。用户消息是输入框序列化后的传输内容；Marloues 必须按实际协议显示它。任务创建时曾有一条 CSV 请求，连接重试后已停止；本批只使用下列两个现有用例轮次。</p>${runs.map((r) => `<details><summary>${esc(r.result.caseId)} · ${esc(r.result.sourceTurnId)}</summary><p>冻结至第 ${r.result.throughLine} 行 · ${link(r.path + "/source.jsonl", "原始 JSONL")} · ${link(r.path + "/snapshot.json", "进入正式 IPC 的消息")}</p><p>输入</p><pre>${esc(r.input)}</pre><p>实际最终回答</p><pre>${esc(r.answer)}</pre></details>`).join("")}</section>
<section id="coverage" class="panel"><h2>现有全部用例的真实对照进度</h2><p>未在 Codex 实际触发的状态保留为未开始，不能用合成场景通过数替代。运行中、取消、权限、附件、媒体、协作等仍需分别采集。</p><div class="table-wrap"><table><thead><tr><th>用例</th><th>进度</th><th>已知范围</th></tr></thead><tbody>${plan.cases.map((c) => `<tr><td><code>${esc(c.id)}</code><br>${esc(c.title)}</td><td>${esc(status(c.status))}</td><td>${esc(c.coverageNote || (c.latestRun ? "本批操作及差异见上方对照。" : "等待按该用例提交真实任务并采集。"))}</td></tr>`).join("")}</tbody></table></div></section>
<section id="evidence" class="panel"><h2>数据检查与证据</h2><p>逐轮核对原始日志哈希、轮次身份、导入的正式 IPC 数据及实际截图。${native.files.length} 份基线文件在生成报告时重新核对 SHA-256。${link("native-comparison.json", "原生证据与哈希")} · ${link("case-plan.json", "用例映射")}</p>${runs.map((r) => `<details><summary>${esc(r.result.caseId)} 的检查与来源</summary><p>SHA-256 <code>${esc(r.result.sourceSha256)}</code></p><p>正式构建 <code>${esc(r.result.build)}</code></p><table>${r.result.checks.map((c) => `<tr><td>${esc(c.id)}</td><td>${status(c.status)}</td></tr>`).join("")}</table><p>${link(r.path + "/interaction-results.json", "实际交互检查")} · ${link(r.path + "/audit.json", "源事件行号审计")}</p></details>`).join("")}<p>表格复制：${link("codex-qa-markdown-table-copy.txt", "Codex 剪贴板内容")} · ${link(plan.cases.find((c) => c.id === "qa-markdown").latestRun + "/marloues-table-copy.txt", "Marloues 剪贴板内容")}。</p><details><summary>复现与边界</summary><pre>npm run test:conversation:case -- --case qa-markdown --open
npm run test:conversation:case:markdown
npm run test:conversation:case:tools
npm run test:conversation:case:report</pre><p>case 命令从已记录的任务日志采集；执行新的 Codex 任务、原生 UI 操作和基线采集仍是独立步骤。新源可以传 --source 和 --turn。每次生成新目录，保留原始证据。正式 App 回放使用独立数据目录，只读，不重新执行历史命令。报告是第一批真实对照结果，当前列出的差异尚未在产品代码中修复。</p></details></section>
</main><script>document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('article[data-status]').forEach(card=>card.hidden=button.dataset.filter!=='all'&&card.dataset.status!==button.dataset.filter)}));</script></body></html>`;
writeFileSync(join(base, "index.html"), html);
const summary = {
  generatedAt: new Date().toISOString(),
  threadId: plan.threadId,
  realTurns: runs.length,
  associatedCases: started,
  pendingCases: pending,
  pairs: native.observations.length,
  integrityChecks: { passed, total: checks.length },
  evidenceFiles: native.files.length,
  parity: "differences-remain",
};
writeFileSync(
  join(base, "report-summary.json"),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary));
