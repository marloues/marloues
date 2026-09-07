import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { evidence, loadVerifiedBundle } from './inspect-bundle.mjs';

const args = process.argv.slice(2);
const archiveIndex = args.indexOf('--archive');
const bundle = loadVerifiedBundle(archiveIndex < 0 ? undefined : args[archiveIndex + 1]);
const results = [];
function isolated(selections, additionalBindings = '') {
  const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  const source = selections.flatMap(([id, names]) => names.map(name => bundle.getSource(id, name))).join('\n');
  vm.runInContext(source + '\n' + additionalBindings, context, { timeout: 1000 });
  return expression => {
    const value = vm.runInContext(expression, context, { timeout: 1000 });
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  };
}
function check(category, label, run, expression, expected) {
  const actual = run(expression);
  try {
    assert.deepEqual(actual, expected);
    results.push({ category, label, expression, expected, actual, passed: true });
  } catch (error) {
    results.push({ category, label, expression, expected, actual, passed: false });
    console.error(`${category}: ${label}\n${error.message}`);
  }
}

const timing = isolated([
  ['E01', ['hJn']], ['E33', ['mqn', 'hqn']],
  ['E34', ['tQn', 'nQn', 'rQn', 'iQn', 'aQn', 'oQn', 'OGn', 'kGn']],
]);
for (const [input, output] of [['completed','complete'],['failed','complete'],['interrupted','cancelled'],['inProgress','in_progress']]) {
  check('status', input, timing, `hJn(${JSON.stringify(input)})`, output);
}
check('timer', '没有工作则没有计时项', timing, 'mqn({status:"in_progress",hasStartedWork:false,workStartedAtMs:10,workedCompletedAtMs:null})', null);
check('timer', '没有开始时间则没有计时项', timing, 'mqn({status:"in_progress",hasStartedWork:true,workStartedAtMs:null,workedCompletedAtMs:null})', null);
check('timer', '运行但没有终点', timing, 'mqn({status:"in_progress",hasStartedWork:true,workStartedAtMs:10,workedCompletedAtMs:null})', {type:'worked-for',status:'working',startedAtMs:10,completedAtMs:null});
check('timer', '终态缺少终点', timing, 'mqn({status:"complete",hasStartedWork:true,workStartedAtMs:10,workedCompletedAtMs:null})', null);
check('timer', '轮次未结束但计时已有终点', timing, 'mqn({status:"in_progress",hasStartedWork:true,workStartedAtMs:10,workedCompletedAtMs:20})', {type:'worked-for',status:'worked',startedAtMs:10,completedAtMs:20});
const user = {type:'user-message'};
const work = {type:'exec'};
const final = {type:'assistant-message',phase:'final_answer',content:'回答',completed:false};
const base = [user,work,final];
check('timer', '运行中放在过程前', timing, `tQn({items:${JSON.stringify(base)},status:"in_progress",workStartedAtMs:10,finalAssistantStartedAtMs:20}).map(x=>x.type)`, ['user-message','worked-for','exec','assistant-message']);
check('timer', '结束后放在回答前', timing, `tQn({items:${JSON.stringify(base)},status:"complete",workStartedAtMs:10,finalAssistantStartedAtMs:20}).map(x=>x.type)`, ['user-message','exec','worked-for','assistant-message']);
check('timer', '取消不走普通插入', timing, `tQn({items:${JSON.stringify(base)},status:"cancelled",workStartedAtMs:10,finalAssistantStartedAtMs:20}).map(x=>x.type)`, ['user-message','exec','assistant-message']);
check('timer', '只有用户和回答不构成前置工作', timing, `tQn({items:${JSON.stringify([user,final])},status:"complete",workStartedAtMs:10,finalAssistantStartedAtMs:20}).length`, 2);
check('timer', '结束且没有回答不插入', timing, `tQn({items:${JSON.stringify([user,work])},status:"complete",workStartedAtMs:10,finalAssistantStartedAtMs:20}).length`, 2);
check('timer', '排除用户、转录和 worktree 初始化', timing, 'iQn([{type:"user-message"},{type:"realtime-transcript"},{type:"worktree-init"}],3)', false);
check('timer', '空 final 占位尚未开始展示', timing, 'kGn({phase:"final_answer",content:"  ",completed:false})', false);
check('timer', '空 final 已完成则满足识别', timing, 'kGn({phase:"final_answer",content:"",completed:true})', true);
check('timer', '结构化 final 可识别', timing, 'kGn({phase:"final_answer",content:"",completed:false,structuredOutput:{}})', true);
check('timer', '有文本的 commentary 不是 final', timing, 'kGn({phase:"commentary",content:"进度",completed:true})', false);
check('timer', '空 final 不冻结计时', timing, 'oQn({items:[{type:"assistant-message",phase:"final_answer",content:"",completed:false}],status:"in_progress",finalAssistantStartedAtMs:20})', null);
check('timer', '包含 sleep', timing, 'hqn({items:[{type:"sleep"}]})', true);
check('timer', '普通工具不算 sleep', timing, 'hqn({items:[{type:"commandExecution"}]})', false);

const collapse = isolated([['E31',['$E']]]);
const collapseBase = {hasFinalAssistantStarted:true,isTurnCancelled:false,hasRenderableAgentItems:true,forceExpanded:false,preventAutoCollapse:false};
for (const [label, change, expected] of [
  ['默认折叠',{}, {shouldAllowCollapse:true,isCollapsed:true}],
  ['还没有最终答复',{hasFinalAssistantStarted:false},{shouldAllowCollapse:false,isCollapsed:false}],
  ['取消',{isTurnCancelled:true},{shouldAllowCollapse:false,isCollapsed:false}],
  ['没有过程',{hasRenderableAgentItems:false},{shouldAllowCollapse:false,isCollapsed:false}],
  ['保留手动展开',{persistedCollapsed:false},{shouldAllowCollapse:true,isCollapsed:false}],
  ['防止自动折叠',{preventAutoCollapse:true},{shouldAllowCollapse:true,isCollapsed:false}],
  ['已有折叠选择优先于自动默认值',{persistedCollapsed:true,preventAutoCollapse:true},{shouldAllowCollapse:true,isCollapsed:true}],
  ['强制展开优先',{persistedCollapsed:true,forceExpanded:true},{shouldAllowCollapse:true,isCollapsed:false}],
]) check('collapse',label,collapse,`$E(${JSON.stringify({...collapseBase,...change})})`,expected);

const blocking = isolated([['E19',['P_r','L_r']]]);
check('blocking','无请求',blocking,'P_r(null)',false);
check('blocking','普通审批',blocking,'P_r({type:"approval"})',true);
for(const kind of ['toolSuggestion','connectorAuth','urlAction','form']) {
  check('blocking',`有轮次的 ${kind}`,blocking,`P_r({type:"mcpServerElicitation",request:{params:{turnId:"t1"}},elicitation:{kind:${JSON.stringify(kind)}}})`,kind==='form');
}
check('blocking','无轮次的 connectorAuth',blocking,'P_r({type:"mcpServerElicitation",request:{params:{}},elicitation:{kind:"connectorAuth"}})',true);

const images = isolated([['E36',['r']]]);
const ready = {type:'generated-image',src:'/example.png',status:'completed'};
const pending = {type:'generated-image',status:'in_progress'};
check('image','运行时保留完成图片和占位',images,`r({items:${JSON.stringify([ready,pending])},isTurnInProgress:true,interruptedByThisClient:false})`,{completedImages:[ready],hasPendingItems:true,pendingPlaceholderCount:1});
check('image','停止隐藏占位但不丢 pending 标志',images,`r({items:${JSON.stringify([pending])},isTurnInProgress:true,interruptedByThisClient:true})`,{completedImages:[],hasPendingItems:true,pendingPlaceholderCount:0});
check('image','轮次结束不计算生成中占位',images,`r({items:${JSON.stringify([pending])},isTurnInProgress:false,interruptedByThisClient:false})`,{completedImages:[],hasPendingItems:false,pendingPlaceholderCount:0});
check('image','追加后清除旧占位',images,`r({items:${JSON.stringify([ready,pending,{type:'user-message',steeringStatus:'accepted'}])},isTurnInProgress:true,interruptedByThisClient:false})`,{completedImages:[ready],hasPendingItems:false,pendingPlaceholderCount:0});
check('image','steered 不重复清除同次追加后的新占位',images,`r({items:${JSON.stringify([pending,{type:'user-message',steeringStatus:'accepted'},pending,{type:'steered'}])},isTurnInProgress:true,interruptedByThisClient:false}).pendingPlaceholderCount`,1);
check('image','失败状态不产生 pending 占位',images,'r({items:[{type:"generated-image",status:"failed"}],isTurnInProgress:true,interruptedByThisClient:false}).pendingPlaceholderCount',0);

// Import aliases resolved from this version: local turn Xn = activity.W;
// local turn ne = app-initial.kGn (export KRt). These are the original helpers.
const activity = isolated([['E28',['W']],['E34',['OGn','kGn']],['E26',['Xr']]], 'const Xn=W, ne=kGn;');
const statusBase = {isTurnInProgress:true,assistantItem:null,proposedPlanItem:null,isExploring:false,hasActiveWebSearch:false,hasActiveDynamicToolCallSummary:false,isAnyNonExploringAgentItemInProgress:false,hasBlockingRequest:false,forceThinking:false};
for(const [label,change,expected] of [
  ['普通运行',{}, {type:'thinking',isVisible:true}],
  ['结束',{isTurnInProgress:false},{type:'none'}],
  ['force 覆盖结束',{isTurnInProgress:false,forceThinking:true},{type:'thinking',isVisible:true}],
  ['探索',{isExploring:true},{type:'exploring'}],
  ['计划',{proposedPlanItem:{type:'proposed-plan',completed:false}},{type:'planning'}],
  ['阻塞请求',{hasBlockingRequest:true},{type:'none'}],
  ['搜索自己显示状态',{hasActiveWebSearch:true},{type:'none'}],
  ['工具有专门摘要',{hasActiveDynamicToolCallSummary:true},{type:'none'}],
  ['其他工具活跃',{isAnyNonExploringAgentItemInProgress:true},{type:'none'}],
  ['最终答复已有文字',{assistantItem:final},{type:'none'}],
  ['最终答复只有空占位',{assistantItem:{...final,content:''}},{type:'thinking',isVisible:true}],
])check('indicator',label,activity,`Xr(${JSON.stringify({...statusBase,...change})})`,expected);

const output = isolated([['E07',['Ltn']]]);
check('output','短输出追加',output,'Ltn({current:"ab",delta:"cd",maxChars:5})',{next:'abcd',didTruncate:false});
check('output','输出超限保留尾部',output,'Ltn({current:"abcd",delta:"ef",maxChars:5})',{next:'bcdef',didTruncate:true});
check('output','大增量保留自身尾部',output,'Ltn({current:"abcd",delta:"1234567",maxChars:5})',{next:'34567',didTruncate:true});
check('output','空增量不再次裁剪原文',output,'Ltn({current:"1234567",delta:"",maxChars:5})',{next:'1234567',didTruncate:true});
check('output','零容量',output,'Ltn({current:"ab",delta:"c",maxChars:0})',{next:'',didTruncate:true});

const report = {
  checkedAt: new Date().toISOString(), version: evidence.version,
  method: 'Isolated execution of hash-verified original helper functions; no application UI, network, or stateful RPC exercised.',
  total: results.length, passed: results.filter(result=>result.passed).length,
  failed: results.filter(result=>!result.passed).length, results,
};
if(args.includes('--write-results')) {
  fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'probe-results.json'), JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({version:report.version,total:report.total,passed:report.passed,failed:report.failed}));
if(report.failed) process.exitCode=1;
