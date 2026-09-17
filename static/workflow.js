/* Additional file-first workflow controls; no network other than the local API. */
'use strict';
function askConfirm(message){return new Promise(resolve=>{
 const d=el('dialog');d.append(el('h2','确认操作'),el('p',message));const row=el('div',undefined,'row');
 const finish=value=>{d.close();d.remove();resolve(value);};
 row.append(button('取消',()=>finish(false)),button('继续',()=>finish(true),'primary'));d.append(row);document.body.append(d);d.oncancel=e=>{e.preventDefault();finish(false);};d.showModal();
});}
$('fork').onclick=()=>action(async()=>{
 await save();const body=modal('创建独立研究方案');body.append(el('p','原论文代码和图保留，新方案允许自由编辑。','small'));
 const input=field(body,'研究方案名称',state.project.name+' · 研究方案');
 body.append(button('创建方案',async()=>{
  if(!input.value.trim())return;state.project=await api(path('/fork'),'POST',{name:input.value.trim()});
  state.parent=null;state.selected=null;state.dirty=false;closeModal();await refreshList();render();fitView();
 },'primary'));
});
const fitButton=button('适应画布',fitView);
fitButton.id='fit-view';$('reset-view').after(fitButton);
const focusButton=button('专注画布',()=>{const on=document.body.classList.toggle('canvas-focus');focusButton.textContent=on?'退出专注':'专注画布';focusButton.classList.toggle('active',on);fitView();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('canvas-focus')&&!$('dialog').open){focusButton.click();}});
$('fit-view').after(focusButton);
const labelsButton=button('连线说明',()=>{
 const body=modal('连线说明');
 body.append(el('p','画布连线的视觉语义；推断绝不冒充已核验事实。','small'));
 const row=(swatch,title,desc)=>{const d=el('div',undefined,'edge-legend-row');const s=el('span',undefined,'edge-legend-swatch '+swatch);const t=el('div');t.append(el('strong',title),el('p',desc,'small'));d.append(s,t);body.append(d);};
 row('edge-legend-verified','实线 · 已核验数据流','经静态代码阅读核实的关键张量流向，如 R、R_train、X与A_norm、A_drop、hidden1/2/3、Wh。');
 row('edge-legend-inferred','虚线斜体 · 推断','来自静态代码推导的组内调用顺序，未经执行验证，一律显式标注「推断」。');
 row('edge-legend-hot','琥珀色 · 悬停数据链','鼠标悬停任一模块或连线时，整条上下游数据链高亮，其余元素淡出。');
 row('edge-legend-other','训练监督 / 优化控制 / 评价','描述训练信号、参数更新与评价选择的关系，不是前向数据流。');
});
focusButton.after(labelsButton);
const reportButton=button('源码核验报告',async()=>{
 const r=await api(path('/review'));const body=modal('助手源码映射报告');
 body.append(el('p',r.current?'报告对应当前图与代码；不代表训练或论文复现通过。':'报告未覆盖当前版本，或尚未完成。','small'),el('pre',r.content));
});
reportButton.id='review-report';$('diff').after(reportButton);
const oldRenderHeader=renderHeader;
renderHeader=function(){oldRenderHeader();reportButton.disabled=!state.project;fitButton.disabled=!state.project;};
const oldLoadProject=loadProject;
loadProject=async function(id,force=false){await oldLoadProject(id,force);const layout=visualLayout();if(layout&&layout.direction==="DOWN"){state.px=35;state.py=35;state.scale=1;transform();}else{requestAnimationFrame(fitView);}};
const oldRenderInspector=renderInspector;
renderInspector=function(){
 oldRenderInspector();const p=state.project;if(!p)return;
 if(state.tab==='files'){
  const body=$('inspector-body');body.replaceChildren(el('h3','完整项目代码'),el('p','当前工作副本，包含助手新增的文件。','small'));
  (p.working_files||p.files).forEach(f=>body.append(button(f,()=>showCode(f),'file-item')));return;
 }
 if(state.tab!=='node')return;
 const n=p.nodes.find(v=>v.id===state.selected);if(!n||!canEdit())return;
 const body=$('inspector-body');
 const relations=p.edges.filter(e=>e.source===n.id||e.target===n.id);
 if(relations.length){body.append(el('h3','关联连接'));relations.forEach(e=>{const from=p.nodes.find(v=>v.id===e.source),to=p.nodes.find(v=>v.id===e.target);body.append(el('p',`${from?.name} → ${to?.name}\n${e.label||'未标注'}`,'small'));});}
 const details=el('details');details.append(el('summary','编辑说明与接口声明'));
 const desc=field(details,'模块说明',n.description||'','textarea');
 desc.onchange=()=>{n.description=desc.value;dirty();};
 ['inputs','outputs'].forEach(key=>{const input=field(details,key==='inputs'?'输入接口 JSON':'输出接口 JSON',JSON.stringify(n[key]||[],null,2),'textarea');
 input.onchange=()=>{try{const value=JSON.parse(input.value);if(!Array.isArray(value)||value.some(v=>!v||typeof v!=='object'||['name','type','shape'].some(k=>typeof(v[k]??'')!=='string')))throw Error();n[key]=value;input.setCustomValidity('');dirty();}catch{input.setCustomValidity('请输入由 name、type、shape 字符串组成的对象数组');input.reportValidity();}};
 });body.append(details);
};
// Keep breadcrumb transitions legible without altering node positions.
$('breadcrumbs').addEventListener('click',()=>fitView());
$('nodes').addEventListener('click',e=>{if(e.target.closest('.expand'))fitView();});
$('nodes').addEventListener('dblclick',()=>fitView());
const oldShowCode=showCode;
showCode=async function(file,start,end){
 await oldShowCode(file,start,end);
 $('dialog-body').prepend(button('对照作者原始文件',async()=>{
  try{const r=await api(path('/code')+'?file='+encodeURIComponent(file)+'&version=original');const body=modal('原始代码 · '+file);body.append(el('p','原始快照 · '+r.sha256,'small'),el('pre',r.content));}
  catch(e){notify('原始快照中没有此文件，可能是研究方案新增文件。'+e.message,true);}
 }));
};
window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();action(save);}});
$('diff').onclick=()=>action(async()=>{
 await save();const d=await api(path('/diff'));const body=modal('与原始基线的差异');
 body.append(el('p',`结构变化：${d.graph_changed?'有':'无'} · 代码文件变化：${d.changed_files.length}`,'small'));
 if(d.graph_diff){Object.entries(d.graph_diff).forEach(([kind,v])=>{body.append(el('h3',kind==='nodes'?'模块变化':'连接变化'));['added','removed','changed'].forEach(k=>{const items=v[k]||[];if(items.length)body.append(el('p',`${{added:'新增',removed:'移除',changed:'修改'}[k]}：${items.length}`),el('pre',JSON.stringify(items,null,2)));});});}
 body.append(el('h3','代码文本差异'),el('pre',d.diff||'暂无代码改动。结构修改可能尚待适配到代码。'));
});
$('export').onclick=()=>action(async()=>{
 await save();const exportProject=state.project.id;const result=await api(path('/export'),'POST',{});
 state.project=await api(path());render();const body=modal('工程已生成');
 body.append(el('p',result.path,'small'),el('p',result.status==='needs_adaptation'?'画布有待适配内容：以下是已导出的工作代码，改动计划保存在 graph.json 与 changes.json，尚未自动改写模型。':'已导出当前工作代码与固定版本；导出不代表训练或论文复现通过。','small'));
 const files=el('details');files.open=true;files.append(el('summary',`浏览导出代码 · ${result.files.length} 个文件`));
 const exportId=result.path.split('/').pop();
 result.files.forEach(file=>files.append(button(file,async()=>{
  const r=await api('/projects/'+encodeURIComponent(exportProject)+'/export-code?export_id='+encodeURIComponent(exportId)+'&file='+encodeURIComponent(file));
  const out=modal('导出快照 · '+file);out.append(el('p','SHA256 '+r.sha256,'small'),el('pre',r.content));
 },'file-item')));body.append(files);
 const warnings=el('details');warnings.append(el('summary','来源及外部资产说明'));(result.warnings||[]).forEach(w=>warnings.append(el('p',String(w),'small')));body.append(warnings);
 body.append(button('创建适配任务',taskDialog));
});

// Layout-only refinement: improve flow direction and edge readability without changing graph semantics.
function autoLayoutNodes(nodes){
 const cols=nodes.length<=4?Math.min(2,nodes.length):3;
 const gapX=255,gapY=170;
 let index=0,row=0;
 while(index<nodes.length){
  const rowNodes=nodes.slice(index,index+cols);
  const count=rowNodes.length;
  rowNodes.forEach((node,j)=>{
   const col=row%2===0?cols-count+j:cols-1-j;
   node.x=col*gapX;
   node.y=row*gapY;
  });
  index+=count;
  row+=1;
 }
}

function edgeKind(label){
 const text=String(label||'');
 if(/\u66f4\u65b0|\u4f18\u5316/.test(text))return 'supply';
 if(/\u8bc4\u4ef7|\u771f\u503c|\u9009\u62e9/.test(text))return 'evaluation';
 if(/\u76d1\u7763|\u76ee\u6807/.test(text))return 'supervision';
 return 'data';
}

function edgeGeometry(a,b,index,nodes){
 const width=205,height=128,portY=38;
 const ax=a.x||0,ay=a.y||0,bx=b.x||0,by=b.y||0;
 const sourceRightX=ax+width,sourceLeftX=ax,targetRightX=bx+width,targetLeftX=bx;
 const sourceY=ay+portY,targetY=by+portY;
 const sameRow=Math.abs(ay-by)<60;
 const leftward=bx<ax-40;
 const between=(from,to)=>nodes.some(n=>n.id!==a.id&&n.id!==b.id&&Math.abs((n.y||0)-ay)<60&&(n.x||0)>from&&(n.x||0)<to);

 if(sameRow&&!between(Math.min(ax,bx),Math.max(ax,bx))){
  const x1=leftward?sourceLeftX:sourceRightX,x2=leftward?targetRightX:targetLeftX;
  const bend=Math.max(38,Math.abs(x2-x1)*.42)*(leftward?-1:1);
  return {d:`M ${x1} ${sourceY} C ${x1+bend} ${sourceY},${x2-bend} ${targetY},${x2} ${targetY}`,label:{x:(x1+x2)/2,y:(sourceY+targetY)/2-8}};
 }

 if(sameRow&&Math.abs(bx-ax)<80){
  const below=by>=ay,laneY=below?Math.max(ay,by)+height+24+(index%3)*10:Math.min(ay,by)-24-(index%3)*10;
  const sx=ax+width/2,sy=below?ay+height:ay,tx=bx+width/2,ty=below?by:by+height;
  return {d:`M ${sx} ${sy} C ${sx} ${laneY},${tx} ${laneY},${tx} ${ty}`,label:{x:(sx+tx)/2,y:laneY+(below?10:-10)}};
 }

 if(!sameRow&&Math.abs(bx-ax)<80){
  const below=by>ay,laneX=(ax+bx)/2+(index%2?18:-18);
  const sx=ax+width/2,sy=below?ay+height:ay,tx=bx+width/2,ty=below?by:by+height;
  return {d:`M ${sx} ${sy} C ${laneX} ${sy},${laneX} ${ty},${tx} ${ty}`,label:{x:laneX,y:(sy+ty)/2}};
 }

 const needsLane=leftward||between(Math.min(ax,bx),Math.max(ax,bx));
 if(!needsLane){
  const bend=Math.max(42,Math.abs(targetLeftX-sourceRightX)*.45);
  return {d:`M ${sourceRightX} ${sourceY} C ${sourceRightX+bend} ${sourceY},${targetLeftX-bend} ${targetY},${targetLeftX} ${targetY}`,label:{x:(sourceRightX+targetLeftX)/2,y:(sourceY+targetY)/2-8}};
 }

 const laneY=Math.max(ay,by)+height+14+(index%3)*7;
 const sx=sourceRightX,sy=sourceY,tx=targetLeftX,ty=targetY;
 return {d:`M ${sx} ${sy} C ${sx+45} ${sy},${sx+45} ${laneY},${sx+78} ${laneY} L ${tx-78} ${laneY} C ${tx-45} ${laneY},${tx-45} ${ty},${tx} ${ty}`,label:{x:(sx+tx)/2,y:laneY+10}};
}

renderEdges=function(nodes){
 const svg=$('edges');svg.replaceChildren();
 const ns='http://www.w3.org/2000/svg';
 const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker');
 marker.id='arrow';marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','9');marker.setAttribute('refY','5');
 marker.setAttribute('markerWidth','6');marker.setAttribute('markerHeight','6');marker.setAttribute('orient','auto-start-reverse');
 const arrow=document.createElementNS(ns,'path');arrow.setAttribute('d','M 0 0 L 10 5 L 0 10 z');arrow.setAttribute('fill','#6f9185');marker.append(arrow);defs.append(marker);svg.append(defs);
 state.project.edges.forEach((edge,index)=>{
  const source=nodes.find(n=>n.id===edge.source),target=nodes.find(n=>n.id===edge.target);if(!source||!target)return;
  const kind=edgeKind(edge.label),geometry=edgeGeometry(source,target,index,nodes);
  const group=document.createElementNS(ns,'g');group.setAttribute('class','edge-group');
  const selected=state.selected;
  if(selected)group.classList.add(edge.source===selected||edge.target===selected?'related':'muted');
  const line=document.createElementNS(ns,'path');line.setAttribute('d',geometry.d);line.setAttribute('class','edge edge-'+kind);
  line.setAttribute('marker-end','url(#arrow)');
  const title=document.createElementNS(ns,'title');title.textContent=`${source.name} -> ${target.name}: ${edge.label||''}`;line.append(title);
  line.onclick=()=>{const body=modal('连接关系');body.append(el('p',`${source.name} -> ${target.name}`),el('p',edge.label||'未标注关系','small'));
   if(canEdit())body.append(button('删除这条连接',()=>{state.project.edges=state.project.edges.filter(v=>v.id!==edge.id);dirty();closeModal();renderGraph();},'danger'));};
  group.append(line);
  if(edge.label){const label=document.createElementNS(ns,'text');label.setAttribute('x',geometry.label.x);label.setAttribute('y',geometry.label.y);label.setAttribute('class','edge-label');label.textContent=edge.label;group.append(label);}
  svg.append(group);
 });
};

const layoutButton=$('layout');
layoutButton.onclick=()=>action(()=>{
 const nodes=state.project.nodes.filter(n=>(n.parent||null)===state.parent);
 autoLayoutNodes(nodes);state.px=40;state.py=60;dirty();renderGraph();requestAnimationFrame(fitView);
});
// ELK-backed readable layout. Routes are presentation-only and never change graph semantics.
function routePath(segments){
 return segments.map(segment=>segment.length?('M '+segment.map(p=>p.x+' '+p.y).join(' L ')):'').join(' ');
}
function routeLabelPoint(segments){
 const points=segments.flat();return points.length?points[Math.floor(points.length/2)]:{x:0,y:0};
}
function visualLayout(){
 if(!state.project)return null;
 if(state.project.visual_layout&&state.project.visual_layout.positions&&state.project.visual_layout.routes)return state.project.visual_layout;
 if(state.layoutVisual&&state.layoutVisual.projectId===state.project.id)return state.layoutVisual;
 try{const value=JSON.parse(localStorage.getItem('research-workbench-layout:'+state.project.id)||'null');if(value&&value.projectId===state.project.id)state.layoutVisual=value;}catch{}
 return state.layoutVisual&&state.layoutVisual.projectId===state.project.id?state.layoutVisual:null;
}
function savedRoute(edge,source,target){
 const layout=visualLayout(),routes=layout&&layout.routes,positions=layout&&layout.positions;
 if(!routes||!positions||!routes[edge.id]||!positions[source.id]||!positions[target.id])return null;
 const sourceFixed=positions[source.id],targetFixed=positions[target.id];
 if(Math.abs(sourceFixed.x-(source.x||0))>.5||Math.abs(sourceFixed.y-(source.y||0))>.5||Math.abs(targetFixed.x-(target.x||0))>.5||Math.abs(targetFixed.y-(target.y||0))>.5)return null;
 return routes[edge.id];
}
async function applyElkLayout(nodes,edges){
 const elk=window.ELK?new window.ELK():null;
 if(!elk)throw Error('ELK 布局引擎未加载');
 const canvas=$('canvas'),direction=canvas.clientWidth<850?'DOWN':'RIGHT';
 const graph={
  id:'root-'+Date.now(),
  layoutOptions:{
   'elk.algorithm':'layered',
   'elk.direction':direction,
   'elk.edgeRouting':'ORTHOGONAL',
   'elk.spacing.nodeNode':direction==='DOWN'?'70':'55',
   'elk.spacing.edgeNode':'22',
   'elk.layered.spacing.nodeNodeBetweenLayers':direction==='DOWN'?'105':'85',
   'elk.layered.crossingMinimization.strategy':'LAYER_SWEEP',
   'elk.layered.nodePlacement.strategy':'NETWORK_SIMPLEX',
   'elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES',
   ...(direction==='RIGHT'?{'elk.layered.wrapping.strategy':'MULTI_EDGE','elk.layered.wrapping.additionalEdgeSpacing':'14','elk.aspectRatio':'1.5'}:{})
  },
  children:nodes.map(n=>({id:n.id,width:205,height:128})),
  edges:edges.map(e=>({id:e.id,sources:[e.source],targets:[e.target]}))
 };
 const out=await elk.layout(graph);
 const byId=new Map((out.children||[]).map(n=>[n.id,n]));
 nodes.forEach(n=>{const laid=byId.get(n.id);if(laid){n.x=Math.round(laid.x);n.y=Math.round(laid.y);}});
 const routes={};
 (out.edges||[]).forEach(edge=>{const segments=(edge.sections||[]).map(section=>[section.startPoint,...(section.bendPoints||[]),section.endPoint]).filter(segment=>segment.length>=2);if(segments.length)routes[edge.id]=segments;});
 state.layoutVisual={projectId:state.project.id,engine:'elk-layered',direction,positions:Object.fromEntries(nodes.map(n=>[n.id,{x:n.x||0,y:n.y||0}])),routes};
 state.project.visual_layout=state.layoutVisual;
 try{localStorage.setItem('research-workbench-layout:'+state.project.id,JSON.stringify(state.layoutVisual));}catch{}
 state.px=35;state.py=35;
 const widthScale=($('canvas').clientWidth-70)/Math.max(1,out.width||1);
 state.scale=direction==='DOWN'?Math.min(1,Math.max(.65,widthScale)):Math.min(1,Math.max(.55,widthScale));
 state.dirty=true;renderGraph();
 notify(direction==='DOWN'?'智能排版完成：采用纵向阅读布局，可上下拖动浏览；点击“适应画布”查看全图。':'智能排版完成：采用横向分层布局。');
}
renderEdges=function(nodes){
 const svg=$('edges');svg.replaceChildren();
 const ns='http://www.w3.org/2000/svg';
 const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker');
 marker.id='arrow';marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','9');marker.setAttribute('refY','5');
 marker.setAttribute('markerWidth','6');marker.setAttribute('markerHeight','6');marker.setAttribute('orient','auto-start-reverse');
 const arrow=document.createElementNS(ns,'path');arrow.setAttribute('d','M 0 0 L 10 5 L 0 10 z');arrow.setAttribute('fill','#6f9185');marker.append(arrow);defs.append(marker);svg.append(defs);
 state.project.edges.forEach((edge,index)=>{
  const source=nodes.find(n=>n.id===edge.source),target=nodes.find(n=>n.id===edge.target);if(!source||!target)return;
  const route=savedRoute(edge,source,target);const geometry=route?null:edgeGeometry(source,target,index,nodes);const kind=edgeKind(edge.label);
  const group=document.createElementNS(ns,'g');group.setAttribute('class','edge-group');const selected=state.selected;
  if(selected)group.classList.add(edge.source===selected||edge.target===selected?'related':'muted');
  const line=document.createElementNS(ns,'path');line.setAttribute('d',route?routePath(route):geometry.d);line.setAttribute('class','edge edge-'+kind);
  line.setAttribute('marker-end','url(#arrow)');
  const title=document.createElementNS(ns,'title');title.textContent=`${source.name} -> ${target.name}: ${edge.label||''}`;line.append(title);
  line.onclick=()=>{const body=modal('连接关系');body.append(el('p',`${source.name} -> ${target.name}`),el('p',edge.label||'未标注关系','small'));
   if(canEdit())body.append(button('删除这条连接',()=>{state.project.edges=state.project.edges.filter(v=>v.id!==edge.id);dirty();closeModal();renderGraph();},'danger'));};
  group.append(line);
  if(edge.label){const pos=route?routeLabelPoint(route):geometry.label;const label=document.createElementNS(ns,'text');label.setAttribute('x',pos.x);label.setAttribute('y',pos.y);label.setAttribute('class','edge-label');label.textContent=edge.label;group.append(label);}
  svg.append(group);
 });
};
layoutButton.onclick=()=>action(async()=>{
 const nodes=state.project.nodes.filter(n=>(n.parent||null)===state.parent);
 const ids=new Set(nodes.map(n=>n.id));
 const edges=state.project.edges.filter(e=>ids.has(e.source)&&ids.has(e.target));
 try{await applyElkLayout(nodes,edges);}catch(error){autoLayoutNodes(nodes);state.px=40;state.py=60;dirty();renderGraph();requestAnimationFrame(fitView);notify('ELK 布局不可用，已切换到轻量排版：'+error.message,true);}
});
$('canvas').addEventListener('wheel',event=>{
 if(event.ctrlKey||event.metaKey||!state.project)return;
 event.preventDefault();
 state.px-=(event.deltaX||0);state.py-=(event.deltaY||0);transform();
},{passive:false});

const oldSave=save;
save=async function(){
 if(!state.dirty)return;
 const project=state.project;
 const payload={revision:project.revision,name:project.name,brief:project.brief,nodes:project.nodes,edges:project.edges};
 if(project.visual_layout)payload.visual_layout=project.visual_layout;
 state.project=await api(path(),'PUT',payload);
 state.dirty=false;render();await refreshList();
};