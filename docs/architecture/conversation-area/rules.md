# 对话区细节规则 MR41–MR90

与主规格 MR01–MR40 合并使用。**参考行为**来自安装包，**应用方式**是 Marloues 的适配决策；所有“补”均未实现。源码定位见对应 D 编号，不把函数存在当成 UI 已验收。

## 正文、代码与表格

| 编号 | 触发条件与参考行为 | Marloues 应用方式 / 当前差距 | 证据 |
|---|---|---|---|
| MR41 | Markdown 渲染抛错：错误边界隔离，retry 重置边界，内容 key 改变可重置。 | `AssistantAnswer` 外补正文错误边界，错误不替换整轮过程/结果；现有运行时错误卡不能代替渲染错误边界。 | D03 GBt/KBt |
| MR42 | fence 未闭合时隐藏代码复制；语言未完整时有 plaintext 回退。闭合后正常复制。 | 保留 `PendingCodeBlock`，显式传递 `fenceOpen`；连续流式更新与闭合交接需回放。 | D04 pIt / D05 maa |
| MR43 | 换行有 off/always/user-controlled 三种模式；user-controlled 读取并更新共享偏好。 | `CodeBlock` 增加 wrap 策略和按钮；不能给每个代码块独立默认值造成同页不一致。当前仅有 pre 和复制。 | D04 FFt / D05 maa |
| MR44 | 可延后高亮增强；未知语言/增强未就绪时保留可读代码；特定预览不立即做昂贵增强。 | 复用已有高亮；新增增强生命周期时先显示文本。具体可视区阈值按 Marloues 性能验证，不照抄未核对常量。 | D05 gia/haa |
| MR45 | 启用 writing-block 模式且语言是无语言/text/md/markdown 时改走写作块；流式期间移除“添加选区到对话”回调。 | 新增 `WorkflowWritingBlock`，模式来自上下文；不要默认把所有无语言代码块改成写作块。 | D04 IFt/OFt / D05 maa |
| MR46 | `mermaid` 或开放 fence 中长度≥2的 mermaid 语言前缀进入图表；闭合后当前渲染键报错才显示代码 fallback。 | 新增 Mermaid；渲染键包含主题和代码，保留上次成功高度；未完成片段不立即报失败。 | D05 maa / D06 xla |
| MR47 | 宽表允许横向滚动和预览入口；普通表也有复制。预览使用独立弹层，不显示图片下载/缩放。 | 新增 Table/TablePreview，复用对话框基础设施；当前 GFM 表格没有这些操作。 | D07 Qca |
| MR48 | 表格复制同时提供原 Markdown 的 text/plain 与渲染表格 text/html；操作按钮标为复制排除区。 | 保存表格原始来源文本；不能把“复制表格”按钮、预览标题混入剪贴板。 | D07 Qca |
| MR49 | 任务列表勾选框 disabled；有序列表保留起点；段落/标题支持自动方向，纯图片段落可形成单图宽块或多图网格。 | 基础节点沿用 ReactMarkdown/GFM；新增媒体段落与方向样式。任务列表不应看起来可以修改执行计划。 | D07 ala/jua |
| MR50 | 数学 token 含 text/display；数学 renderer 异步加载，加载时显示 raw。 | 新增 `WorkflowMath` 和解析扩展，分别处理行内/块公式；当前 remarkPlugins 只有 GFM。 | D08 rda/$la |
| MR51 | 行内代码先保留普通代码复制语义，再按内容和上下文识别文件/插件等可导航引用；decorateText=false 时不装饰。 | 新增 InlineCode；普通命令片段不全部做成链接。路径解析与打开回调归链接服务。 | D04 sIt |
| MR52 | Markdown 链接先判断会话内目标，再识别应用/文件等特殊目标，最后普通外链；带宿主与 cwd。 | 新增 MarkdownLink；现有默认 a 无法表达行号、远端宿主及任务身份。执行打开动作前由目标解析结果决定处理方式。 | D09 _B/Jkt |

## 媒体、附件与消息操作

| 编号 | 触发条件与参考行为 | Marloues 应用方式 / 当前差距 | 证据 |
|---|---|---|---|
| MR53 | 媒体按源路径分类图片/音频/视频，解析相对路径与本地/远端宿主；缓存 key 可绑定轮次。 | 新增 MarkdownMedia；复用 `workflowImageSource` 的可用逻辑，但不能把它当完整媒体宿主协议。 | D10 Isa |
| MR54 | 媒体 loading：音频有 loading 行；图/视频在 scrollable 模式可占位，其他模式可能暂不渲染。 | 模型表达 loading/unavailable/ready 和 layout，按具体场景决定占位；不能笼统宣称 Codex 所有图片加载都保持固定高度。 | D10 Isa/Bsa/Zoa |
| MR55 | 源不可用、加载失败或资源策略阻止时显示不可用状态；视频/audio 就绪有 controls，预加载 metadata。 | 正文媒体补 fallback；错误源和重试状态按 src/key 隔离。现有 Markdown 默认 img 不满足该协议。 | D10 Isa |
| MR56 | 图片画廊有可用数量、分页/前后导航、预览和按能力启用的编辑/分享。 | `ImageLightbox` 已有下载/缩放/键盘/焦点；结果卡补传 gallery。编辑/分享没有宿主能力时不放空按钮。 | D18 UGn |
| MR57 | 生图的 pending 槽与已生成图同时存在；无 src 且不再运行时不显示空成功图片。特殊 failure 有独立提示。 | 取消不显示“已生成图片”；分开 pending/status/src，按批次恢复与去重。当前普通非 running 文案过宽。 | D01 YT / D18 UGn |
| MR58 | 空用户文本但有外部附件仍有附件区；是否显示气泡还取决于正文/状态。 | 沿用 UserMessage 现有附件空文本支持；不要因空字符串隐藏整条消息。 | D01 YT/D12 Eg |
| MR59 | 上传图片、appshot、文件、上下文、评论、选中文字、答复注释各有不同呈现和目标。 | 在现有 user-message contract 中保留类型；未支持类型进入有名称的附件回退，不统一拍平成文本。 | D01 YT/D12 Xx/Jx/A_ |
| MR60 | heartbeat、委派、hook blocked/feedback、goal、targeted reply 改变来源/状态显示和部分操作资格。 | 新增消息来源投影，状态与正文分开；这些信息需要 canonical 字段，不能从消息字面推断。 | D01 YT/D23 |
| MR61 | 原消息编辑有初始内容、草稿变化、取消和提交回调。 | 新增 editor 和身份协议；当前“回填 composer”继续明确为复用输入，不称为原地编辑。提交失败保留草稿/附件。 | D12 Eg/pg；失败保持为适配要求 |
| MR62 | 助手复制须非空且 completed 或明确允许流式复制；分支回调在 completed 后提供。 | Footer 从模型获得资格，补 busy；不能只看 finalText 非空就提前启用所有动作。 | D02 Oy/zy |
| MR63 | 操作行与时间戳是独立策略；可单独显示时间戳，hover-only 可单独配置；compact 模式还有不同包装。 | 增加 timestampPolicy；保留现有 hover/focus-within。消息 sentAt 与任务用时使用不同字段。 | D02 Oy/zy/lg |
| MR64 | 拷贝正文可做引用/路径/注释清理；HTML 来自被选目标 DOM；按钮等区域不应进入复制。 | `documentText` 仍作纯文本源；HTML 复制显式标记排除区。不能简单复制整个轮次 innerHTML。 | D02 Oy / D07 Qca / D08 mda |

## 工具、请求与过程

| 编号 | 触发条件与参考行为 | Marloues 应用方式 / 当前差距 | 证据 |
|---|---|---|---|
| MR65 | exec 先按 read/search/list_files 分类，其余进入通用命令；后台运行/结束由工具状态和 processId 判断。 | 保留现有摘要分类；补后台进程事实，轮次结束不能自动等同进程结束。 | D13 tx |
| MR66 | 通用命令详情从 collapsed 开始；展开才挂载 shell body；内部命令用时可每秒更新，与整轮 worked-for 分离。 | 纠正 MR17：命令维持默认关闭；新增公共 disclosure 时保留每类策略和稳定 item key。 | D13 rx |
| MR67 | 命令 footer 区分 running、exitCode==0、非零/未知退出码、interrupted；完整输出不是摘要。 | `CommandPresentation` 补 canonical exitCode；不要把“有输出”当成功，也不要把所有停止归为错误。 | D13 rx |
| MR68 | patch 优先评审拒绝，再 success=true/false，再 approvalRequestId 与取消状态；得到 applied/rejected/pending/streaming/stopped。 | FileChangeRow 用显式状态模型；对应创建/编辑/删除动作的文案，不统一“已修改”。 | D13 $S/tC |
| MR69 | 每文件 diff 与整轮 diff 有不同边界；patch 没有 changes 且无可视化活动时不生成空行；详情受 showDiffDetails 控制。 | 保留 ResultCards 与 FileChangeRow 分工；避免零差异但有效文件动作被统计过滤静默丢失，制定二进制/重命名回退。 | D13 $S / D17；回退为适配要求 |
| MR70 | 整轮 diff 可有多个 cwd/patch batch；回滚操作受 showRevertButton、宿主能力与状态限制，失败有独立反馈。 | 先补 batch/identity/异步结果契约；当前 openReview 有入口，但没有同等回滚协议。不能只新增按钮。 | D17 rT |
| MR71 | MCP result.content 保留 6 类；structuredContent 存在时可抑制重复 text，结构化 JSON 与文本完全重复时不双显。 | ToolDetail 增加 typed blocks 与去重依据；当前 input/output 字符串解析只能覆盖一部分。 | D14 Vn/qn/Kn |
| MR72 | 原始结果对话框打开后才格式化 callId/invocation/durationMs/result。 | 新增 RawToolResult，按需序列化，关闭不继续渲染巨量 JSON；保留完整原始记录。 | D14 Vn |
| MR73 | 普通 MCP 展开由用户选择/保存状态/autoExpand 参数决定；交互卡不可折叠时强制呈现；并非所有 running MCP 自动打开。 | ToolDisclosure 明确政策；App 与普通详情不共用一句默认值。 | D14 Vn |
| MR74 | MCP App 根据资源 URI、错误/加载、渲染数据和 superseded 状态选择 loading/HTML/fallback；提供重试，保留上次可用数据。 | 新增 McpAppSurface，先贯通 callId/resourceUri；不能把 HTML 当普通 Markdown。整体折叠/虚拟化不得无意销毁会话内交互状态。 | D14 Vn/Un |
| MR75 | 工具 logo 受 loadRemoteLogos 和可用 metadata 控制，原生应用/浏览器/connector 有不同来源。 | 复用 ActivityRow 图标位，新增来源元信息；没有数据继续通用图标，不凭工具名伪造已连接应用。 | D14 Vn |
| MR76 | 问题回答记录、已跳过、权限等待和 elicitation 分开。完成 permission 在 Codex 此路由不显示；Marloues 当前保留终态审批历史。 | 保留历史可作为明确差异；新增 QuestionAnswerRecord，表单继续通过 owner/requestId 关联宿主。 | D15 xT/gC/aE |
| MR77 | elicitation 有 8 类：toolSuggestion/auth/url 是专用卡，其他等待/回应按类型处理。 | `ElicitationRequest` 使用 discriminated union，未知形式有回退；请求完成后不得继续显示可重复提交按钮。 | D15 tE |
| MR78 | 计划既有摘要进度又有展开步骤；空计划有回退，current step 和完成数决定显示。 | 保留 PlanDetail，增加进度/展开状态；自动滚动当前步骤不得覆盖读者滚动意图，接统一锚点 hook。 | D16 hw/gw/Sw；滚动约束为适配要求 |
| MR79 | 协作聚合动作与单个代理当前活动分别渲染，带代理/源任务身份及打开回调。 | 扩展 CollabAgentToolRow，不能仅从当前 activeSessionId 推断来源。 | D22 xS/iw/ZS |
| MR80 | stream error 可显示重连次数/总次数和 additionalDetails，系统错误走不同 renderer，retry 带源 turn。 | ErrorCard 扩展结构化重试信息；保留已生成正文和工具结果；错误详情默认按规则收起。 | D20 HC/D21 DDr |

## 资源、引用与跨组件约束

| 编号 | 触发条件与参考行为 | Marloues 应用方式 / 当前差距 | 证据 |
|---|---|---|---|
| MR81 | 结果资源为 artifact-session/file/google-drive/appgen-app/website 五类；每类不同身份和打开动作。 | 新增 ResultResource union；现有 diff/image/browser cards 继续存在，不能把它们声称为五类资源实现。 | D19 OW |
| MR82 | 资源列表初始前三项，展开更多后显示全部；空列表返回 null。 | ResourceList 独立管理，按稳定资源键；不与现有文件 diff“再显示”状态串用。 | D19 OW，NW=3 |
| MR83 | 文件打开/远端文档/网站/appgen 的操作取决于宿主和目标；artifact feedback 有额外开关与文件格式资格。 | 仅接已实现能力；保持 source identity、busy/error。feedback 非必需，未启用不显示。 | D19 fW/vW/_W/RU/UU |
| MR84 | directive 按注册表查找；未知 directive 显示 raw；已知文件引用/详情/后续问题/可视化各有独立参数。 | 新增受控 registry；默认保留未知文本。不要把任意 directive 文本解释成可执行操作。 | D08 zua / D11 Zzt |
| MR85 | assistant 的 reveal/streaming/完成影响淡入与可访问播报；播报身份与会话和消息关联。 | 补 message announcement 边界，避免每次 snapshot 重读全文；使用稳定 message key；具体播报节奏待 UI 验收。 | D02 Oy |
| MR86 | 正文媒体、MCP 卡、表格/代码展开都能改变高度；有些内容离屏后仍需保存交互状态。 | 统一调用滚动/锚点层；状态保存归 `(threadId,turnId,itemId)`，纯可视容器可卸载，交互状态不能靠局部挂载维持。 | 主规格 MR19/MR33/MR38；适配约束 |
| MR87 | model/personality/reroute/fork/worktree-init 是显式事件，来源与输出不同。 | 新增 SessionEvent renderer 和 canonical 事件字段；旧记录缺字段时保留 unknown/raw，不猜测发生时间。 | D23 |
| MR88 | structured heartbeat 内容可由 content、notificationMessage 或 DONT_NOTIFY 回退产生；空内容不渲染。 | 只有新增 structuredOutput 后启用；不能对普通助手回复套 heartbeat 规则。 | D01 YT |
| MR89 | 同一组件受显示模式和宿主能力开关影响，可存在而不在当前 UI 路径出现。 | 每个 capability 缺口记录“入口/数据/呈现/验证”四项；组件计数不作为对齐百分比。 | D01/D02/D14/D19 |
| MR90 | 静态清单、契约实现、回放通过是三个不同证据层级。 | 先按 routes.json 查漏，再落实 contracts，再执行 acceptance 场景；未运行场景不得标通过。 | 本规格验收规则 |

## 实现时采用的优先级

稳定执行事实 → 能力与显示模式 → 内容类型 → 对应类型的强制状态 → 已保存用户选择 → 默认展示策略。Markdown 解析、工具状态和滚动各有一个负责人，组件不得各自猜测 final、running 或源任务身份。

这些优先级是 Marloues 的适配设计。未从安装包确认的参数值、动画阈值和宿主实现细节没有冒充为 Codex 的普遍规则。
