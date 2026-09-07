/** Canonical replay inputs. All scenes are loaded through the app's persisted
 * session → readThread → normal conversation route, with the real preload. */
export const attachmentLongFilename =
  "conversation-attachment-layout-reference-with-a-very-long-name-and-no-breaks-for-overflow-validation.ts";

export function createScenes({ cwd, media }) {
  const epoch = 1788620000000;
  const image = media.image;
  const patch =
    "diff --git a/evidence.ts b/evidence.ts\n--- a/evidence.ts\n+++ b/evidence.ts\n@@ -1 +1 @@\n-const answer = 1;\n+const answer = 42;\n";
  const answer = (text) => ({
    type: "agentMessage",
    id: "answer",
    phase: "final_answer",
    settled: true,
    text,
  });
  const tool = (id, tool, args, output, status = "completed") => ({
    type: "dynamicToolCall",
    id,
    tool,
    arguments: args,
    output: {
      text: typeof output === "string" ? output : JSON.stringify(output),
      truncated: false,
    },
    status,
    settled: !["running", "pending"].includes(status),
  });
  const scene = (id, title, items, extra = {}) => ({
    id: `qa-${id}`,
    title: `验收 ${id} ${title}`,
    items,
    ...extra,
  });
  const text = [
    "# 标题一级\n\n## 标题二级\n\n中文、English 与 العربية עברית。**粗体**、*斜体*、~~删除~~。",
    "> 引用正文\n> 第二行\n\n---",
    "4. 从第四项开始\n5. 第五项\n\n- [x] 只读已完成\n- [ ] 只读未完成\n\n- 无序列表\n  - 嵌套列表",
    "| 很长的字段名称 | 左对齐 | 右对齐 | 超宽内容 |\n| :--- | :--- | ---: | --- |\n| 测试 | 表格正文 | 42 | " +
      "宽".repeat(130) +
      " |",
    "行内公式 $E = mc^2$。\n\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$",
    '```typescript\nconst answer = 42;\n\nconst long = "' +
      "a".repeat(180) +
      '";\n```',
    "```markdown\n这是写作块。\n\n第二段写作内容。\n```",
    "```mermaid\nflowchart LR\n A[输入] --> B[工具]\n B --> C[结果]\n```",
    "普通标识符 `answer`。文件引用 `./evidence.ts:2`。 [本地文件](./evidence.ts:2) [缺失文件](./missing.txt) [安全外链](https://example.com/qa) [未知协议](future://thing)。",
    "跨块引用 [参考][source] 和脚注[^one]。\n\n[source]: https://example.com/reference\n\n[^one]: 脚注内容。",
    '未知指令保留：::future-component{value="可读"}',
  ].join("\n\n");
  const question = (id, status, kind = "form", overrides = {}) => ({
    type: "permissionRequest",
    id,
    toolName: "elicitation",
    reason: "完整字段",
    status: status === "pending" ? "pending" : "completed",
    settled: status !== "pending",
    question: {
      sessionId: "qa-questions",
      turnId: "turn-questions",
      requestId: id,
      title: `${kind} ${status}`,
      kind,
      source: "验收源",
      status,
      fields: [
        {
          id: "text",
          label: "文字",
          type: "string",
          required: true,
          minLength: 2,
          maxLength: 12,
        },
        {
          id: "integer",
          label: "整数",
          type: "integer",
          required: true,
          minimum: 1,
          maximum: 5,
        },
        { id: "decimal", label: "小数", type: "number" },
        { id: "flag", label: "确认选项", type: "boolean" },
        { id: "one", label: "单选", type: "enum", options: ["甲", "乙"] },
        {
          id: "many",
          label: "多选",
          type: "multi",
          options: ["一", "二", "三"],
        },
      ],
      answers:
        status === "answered"
          ? {
              text: "已填写",
              integer: 2,
              decimal: 1.5,
              flag: true,
              one: "甲",
              many: ["一", "三"],
            }
          : undefined,
      ...overrides,
    },
  });
  const scenarios = [
    scene("markdown", "正文全部节点", [answer(text)]),
    scene("media", "图片音视频与失败", [
      answer(
        `![正文图片](${image})\n\n![音频](${media.audio})\n\n![视频](${media.video})\n\n![无效图片](${media.invalid})`,
      ),
    ]),
    scene("attachments", "附件空正文", [answer("附件消息仍然保留。")], {
      userContent: [
        { type: "localImage", path: media.imagePath },
        { type: "image", url: image },
        {
          type: "file",
          name: "evidence.ts",
          mimeType: "text/plain",
          text: "文件内容",
          path: cwd + "/evidence.ts",
        },
        { type: "url", url: "https://example.com/source", title: "附件链接" },
        { type: "skill", name: "验收技能", id: "qa-skill" },
        { type: "mention", name: "引用文件", path: cwd + "/evidence.ts" },
        {
          type: "browserComment",
          commentId: 9,
          ref: "target-9",
          tagName: "DIV",
          text: "选中页面内容",
          attributes: {},
          rect: { x: 0, y: 0, width: 20, height: 20 },
          viewport: { width: 100, height: 100 },
          scrollX: 0,
          scrollY: 0,
          comment: "页面批注",
          pageUrl: "https://example.com/source",
        },
      ],
    }),
    scene("attachment-layout", "长附件与图片滚动", [answer("附件布局验收。")], {
      userContent: [
        ...Array.from({ length: 8 }, (_, index) => ({
          type: "localImage",
          path: index % 2 ? media.secondImagePath : media.imagePath,
        })),
        {
          type: "file",
          name: attachmentLongFilename,
          path: cwd + "/" + attachmentLongFilename + "#L2",
        },
        { type: "file", name: "evidence.ts", path: cwd + "/evidence.ts#L2" },
        {
          type: "url",
          url: "https://example.com/attachments/long-reference-with-additional-context",
          title: "带有完整链接说明的附件引用",
        },
        { type: "skill", name: "验收技能", id: "qa-skill" },
        { type: "mention", name: "引用文件", path: cwd + "/evidence.ts" },
        {
          type: "text",
          text: "图片和文件按照输入顺序排列；长名称完整保留，附件条可以独立滚动。",
        },
      ],
    }),
    scene("long-user", "用户长消息", [answer("长消息回答。")], {
      prompt: Array.from(
        { length: 24 },
        (_, i) => `长消息第 ${i + 1} 行。`,
      ).join("\n"),
    }),
    ...["running", "completed", "failed", "cancelled"].map((status) =>
      scene(`command-${status}`, `命令 ${status}`, [
        {
          type: "commandExecution",
          id: `cmd-${status}`,
          command: 'printf "验收命令"',
          cwd,
          shell: "zsh",
          status,
          exitCode:
            status === "completed" ? 0 : status === "failed" ? 1 : undefined,
          durationMs: 4210,
          output: {
            text: `命令输出 ${status}\n第二行输出`,
            truncated: status === "failed",
            originalChars: 100000,
          },
          settled: status !== "running",
        },
        answer(`命令状态 ${status} 的结果。`),
      ]),
    ),
    ...["completed", "pending", "failed", "rejected", "cancelled"].map(
      (status) =>
        scene(`patch-${status}`, `文件变更 ${status}`, [
          {
            type: "fileChange",
            id: `patch-${status}`,
            status,
            settled: status !== "pending",
            changes: [
              {
                path: cwd + "/evidence.ts",
                kind: "update",
                diff: { text: patch, truncated: false },
              },
              {
                path: cwd + "/empty.bin",
                kind: "add",
                diff: { text: "", truncated: false },
              },
            ],
          },
          answer(`文件变更状态 ${status}。`),
        ]),
    ),
    scene("many-files", "多文件结果展开", [
      {
        type: "fileChange",
        id: "many",
        status: "completed",
        settled: true,
        changes: [
          "evidence.ts",
          "empty.bin",
          "third.txt",
          "fourth.txt",
          "fifth.txt",
        ].map((path) => ({
          path: cwd + "/" + path,
          kind: path === "evidence.ts" ? "update" : "add",
          diff: { text: path === "evidence.ts" ? patch : "", truncated: false },
        })),
      },
      answer("五个文件结果。"),
    ]),
    scene("mcp", "MCP 六类内容", [
      {
        type: "mcpToolCall",
        id: "mcp-six",
        tool: "mcp__missing__six",
        server: "missing",
        status: "completed",
        settled: true,
        arguments: { question: "六类内容" },
        result: {
          content: [
            { type: "text", text: '{"count":2,"ok":true}' },
            {
              type: "image",
              mimeType: "image/svg+xml",
              data: media.svgBase64,
              annotations: { audience: ["user"] },
            },
            { type: "audio", mimeType: "audio/wav", data: media.wavBase64 },
            {
              type: "resource_link",
              uri: "https://example.com/report",
              name: "资源报告",
              description: "资源描述",
              mimeType: "text/plain",
            },
            {
              type: "resource",
              resource: {
                uri: "file:///fixture/report.txt",
                mimeType: "text/plain",
                text: "嵌入资源正文",
              },
            },
            { type: "future-content", value: "未知内容完整保留" },
          ],
          structuredContent: { count: 2, ok: true },
          _meta: { source: "qa" },
        },
      },
      answer("结构化结果完成。"),
    ]),
    ...["running", "failed", "cancelled", "completed"].map((status) =>
      scene("dynamic-" + status, "动态工具 " + status, [
        tool(
          "dynamic-" + status,
          "QA_dynamic",
          { value: "原始输入" },
          status === "completed" ? "" : "工具输出 " + status,
          status,
        ),
        answer("工具最终状态 " + status),
      ]),
    ),
    scene(
      "question-kinds",
      "全部输入类型",
      ["question", "auth", "toolSuggestion", "confirmation", "permission"].map(
        (kind) => question("kind-" + kind, "pending", kind),
      ),
    ),
    scene("mcp-failed", "失败结构化结果", [
      {
        type: "mcpToolCall",
        id: "mcp-error",
        tool: "mcp__qa__error",
        server: "qa",
        status: "failed",
        settled: true,
        arguments: {},
        result: {
          isError: true,
          content: [{ type: "text", text: "工具返回错误" }],
          structuredContent: { error: "不同的结构化错误" },
          _meta: { trace: "qa-error" },
        },
      },
      answer("工具失败后的说明"),
    ]),
    scene("tool-details", "动态工具专用详情", [
      tool(
        "t-read",
        "Read",
        { file_path: cwd + "/evidence.ts" },
        "读取详情内容",
      ),
      tool("t-list", "LS", { path: cwd }, "evidence.ts\nempty.bin"),
      tool(
        "t-search",
        "Grep",
        { pattern: "answer", path: cwd },
        "evidence.ts:2: answer",
      ),
      tool(
        "t-plan",
        "update_plan",
        {
          plan: [
            { step: "准备", status: "completed" },
            { step: "运行", status: "in_progress" },
            { step: "核对", status: "pending" },
          ],
        },
        "计划已更新",
      ),
      tool(
        "t-tools",
        "tool_search",
        { query: "qa" },
        "Found 2 tools:\nread\nwrite",
      ),
      tool(
        "t-usage",
        "token_count",
        {},
        {
          totalTokens: 1200,
          inputTokens: 1000,
          outputTokens: 200,
          limitTokens: 10000,
        },
      ),
      tool(
        "t-browser",
        "js",
        { code: "document.title" },
        JSON.stringify({ url: "https://example.com/qa", title: "验收网页" }),
      ),
      answer("动态工具详情结束。"),
    ]),
    scene("reasoning", "推理与计划", [
      {
        type: "reasoning",
        id: "reasoning",
        summary: "推理摘要",
        content: [{ text: "完整推理正文\n第二段推理", truncated: false }],
        settled: true,
      },
      {
        type: "plan",
        id: "plan",
        text: "## 静态计划\n\n- [x] 准备\n- [ ] 检查",
      },
      answer("推理后的回答。"),
    ]),
    scene("markers", "显式标记与未知内容", [
      { type: "imageView", id: "image-view", path: media.imagePath },
      {
        type: "enteredReviewMode",
        id: "review-enter",
        review: { branch: "qa-review" },
      },
      {
        type: "exitedReviewMode",
        id: "review-exit",
        review: { result: "changes_requested" },
      },
      {
        type: "hookPrompt",
        id: "hook",
        fragmentCount: 2,
        fragments: ["片段一", "片段二"],
      },
      { type: "contextCompaction", id: "compact" },
      ...[
        "model-changed",
        "model-rerouted",
        "personality-changed",
        "thread-forked",
        "worktree-created",
        "worktree-setup-failed",
        "runtime-status",
        "future-event",
      ].map((rawType) => ({
        type: "unknown",
        id: rawType,
        rawType,
        raw: { detail: `原始 ${rawType}`, origin: "qa-markers" },
      })),
      answer("显式标记完成。"),
    ]),
    ...["running", "completed", "failed", "cancelled"].map((status) =>
      scene(`collab-${status}`, `协作代理 ${status}`, [
        {
          type: "collabAgentToolCall",
          id: "collab-" + status,
          tool: "spawn_agent",
          status,
          settled: status !== "running",
          senderThreadId: "qa-collab-" + status,
          receiverThreadIds: ["qa-child"],
          prompt: "读取并检查文件",
          model: "验收模型",
          reasoningEffort: "high",
        },
        answer(`协作状态 ${status}。`),
      ]),
    ),
    scene("child", "子任务会话", [answer("子任务已完成，只属于 qa-child。")]),
    scene(
      "permissions",
      "普通权限各状态",
      ["pending", "completed", "denied", "timed_out", "cancelled"].map(
        (status) => ({
          type: "permissionRequest",
          id: "permission-" + status,
          toolName: "工具-" + status,
          reason: JSON.stringify({ reason: "对应 " + status }),
          status,
          settled: status !== "pending",
          timeoutMs: 30000,
        }),
      ),
    ),
    scene("questions", "表单及回答记录", [
      question("form-pending", "pending"),
      question("form-answered", "answered"),
      question("form-skipped", "skipped"),
      question("form-cancelled", "cancelled"),
      question("form-unsupported", "pending", "unknown", {
        unsupported: "此表单包含暂不支持的字段类型，可跳过或取消。",
      }),
      question("url-pending", "pending", "url", {
        fields: [],
        url: "https://example.com/auth",
      }),
      answer("问题记录。"),
    ]),
    ...["running", "completed", "failed", "cancelled"].map((status) =>
      scene(`image-${status}`, `生图 ${status}`, [
        {
          type: "imageGeneration",
          id: "image-" + status,
          status,
          settled: status !== "running",
          revisedPrompt: "验收图像",
          savedPath: status === "completed" ? media.imagePath : null,
        },
        answer("生图状态 " + status),
      ]),
    ),
    scene("gallery", "图片画廊与结果", [
      {
        type: "imageGeneration",
        id: "gallery-one",
        status: "completed",
        settled: true,
        savedPath: media.imagePath,
      },
      {
        type: "imageGeneration",
        id: "gallery-two",
        status: "completed",
        settled: true,
        savedPath: media.secondImagePath,
      },
      {
        type: "imageGeneration",
        id: "gallery-three",
        status: "cancelled",
        settled: true,
      },
      answer("保留两张已完成图片。"),
    ]),
    scene("web", "网页搜索", [
      {
        type: "webSearch",
        id: "web",
        query: "验收搜索",
        action: {
          type: "search",
          query: "验收搜索",
          results: [
            {
              url: "https://example.com/qa",
              title: "验收网页",
              snippet: "网页摘要",
            },
          ],
        },
      },
      answer("网页搜索结果。"),
    ]),
    scene(
      "error",
      "失败正文保留",
      [
        {
          type: "fileChange",
          id: "applied-before-error",
          status: "completed",
          settled: true,
          changes: [
            {
              path: cwd + "/evidence.ts",
              kind: "update",
              diff: { text: patch, truncated: false },
            },
          ],
        },
        answer("错误前已有正文，不应消失。"),
      ],
      {
        status: "failed",
        error: "请求断流，重连 2/5 后失败。",
        errorDetails: { attempt: 2, total: 5, source: "qa-error" },
      },
    ),
    scene(
      "cancel",
      "取消回合",
      [
        {
          type: "commandExecution",
          id: "cancel-command",
          command: "sleep 1",
          status: "cancelled",
          settled: true,
          output: { text: "取消前输出", truncated: false },
        },
        answer("停止前已有说明。"),
      ],
      { status: "cancelled" },
    ),
    scene("history", "长历史虚拟化", [], { history: true }),
  ];
  return scenarios.map((s, index) => {
    const turnId = `turn-${s.id.slice(3)}`;
    const messages = s.history
      ? Array.from({ length: 160 }, (_, i) => {
          const id = `history-${i}`;
          const ts = epoch + i * 1000;
          return [
            {
              id: "user-" + id,
              turnId: id,
              role: "user",
              content: `历史消息 ${i}`,
              userContent: [{ type: "text", text: `历史消息 ${i}` }],
              timestamp: ts,
              items: [],
            },
            {
              id: "assistant-" + id,
              turnId: id,
              role: "assistant",
              content: `历史回答 ${i}`,
              timestamp: ts,
              startedAt: ts,
              completedAt: ts + 900,
              status: "completed",
              items: [
                {
                  type: "agentMessage",
                  id: "answer-" + id,
                  text: `历史回答 ${i}\n\n` + "保留阅读位置。".repeat(18),
                  phase: "final_answer",
                  settled: true,
                },
              ],
            },
          ];
        }).flat()
      : [
          {
            id: "user-" + s.id,
            turnId,
            role: "user",
            content: s.prompt ?? (s.userContent ? "" : s.title),
            userContent: s.userContent ?? [
              { type: "text", text: s.prompt ?? s.title },
            ],
            timestamp: epoch,
            items: [],
          },
          {
            id: "assistant-" + s.id,
            turnId,
            role: "assistant",
            content: s.items
              .filter((i) => i.type === "agentMessage")
              .map((i) => i.text)
              .join("\n\n"),
            timestamp: epoch,
            startedAt: epoch,
            completedAt: epoch + 9000,
            status: s.status ?? "completed",
            error: s.error,
            errorDetails: s.errorDetails,
            modelName: "验收模型",
            modelId: "qa-model",
            timing: {
              basis: "host-observed",
              workStartedAt: epoch + 1000,
              finalAnswerStartedAt: epoch + 6000,
            },
            items: s.items,
          },
        ];
    return {
      ...s,
      session: {
        id: s.id,
        title: s.title,
        updatedAt: epoch + index * 1000,
        cwd,
        messages,
      },
    };
  });
}
