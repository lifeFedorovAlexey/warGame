// Opt-in instrumentation. No observer, timer, wrappers or DOM in normal play.
const enabled=typeof location!=='undefined'&&new URLSearchParams(location.search).has('perf');
export const distribution=values=>{
 const sorted=values.slice().sort((a,b)=>a-b),at=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??0;
 return {count:sorted.length,p50:at(.5),p95:at(.95),p99:at(.99),max:sorted.at(-1)??0,total:values.reduce((a,b)=>a+b,0)};
};
function createProfiler(){
 let frames=[],tasks=[],samples={},current=null,last=null,lastPaint=0,started=performance.now(),recording=true;
 const overlay=document.createElement('pre');overlay.id='performance-overlay';
 overlay.style.cssText='position:fixed;left:12px;top:128px;z-index:10000;pointer-events:none;margin:0;color:#efdbab;font:11px/1.3 monospace;text-shadow:0 1px 2px #000;max-width:calc(100vw - 24px);white-space:pre-wrap';
 document.body.append(overlay);
 let observer;
 if(globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')){
  observer=new PerformanceObserver(list=>{for(const e of list.getEntries())if(recording&&e.startTime>=started){
   tasks.push({start:e.startTime,ms:e.duration,name:e.name,attribution:e.attribution.map(a=>({name:a.name,containerType:a.containerType,containerSrc:a.containerSrc}))});
   if(tasks.length>2000)tasks.shift();
  }});observer.observe({type:'longtask',buffered:false});
 }
 const record=(name,start,ms)=>{
  if(!recording)return;
  const list=samples[name]??=[];if(list.length<100000)list.push(ms);
  if(current){current.stages[name]=(current.stages[name]??0)+ms;if(ms>4)current.slow.push({stage:name,start,ms,stack:new Error().stack});}
 };
 const api={
  wrap(object,key,name=key){const original=object[key];if(typeof original!=='function')return;
   object[key]=function(...args){const start=performance.now();let result;try{return result=original.apply(this,args);}finally{const ms=performance.now()-start;record(name,start,ms);if(name==='fog'&&result===true)record('fog update',start,ms);}};
  },
  measure(name,fn){const start=performance.now();try{return fn();}finally{record(name,start,performance.now()-start);}},
  begin(now){if(!recording)return;const start=performance.now();if(last!==null&&frames.length){const previous=frames.at(-1);previous.interval=start-previous.start;previous.rafInterval=now-last;}current={start,raf:now,interval:null,rafInterval:null,stages:{},slow:[]};last=now;},
  end(world){if(!current)return;current.cpuMs=performance.now()-current.start;
   const info=world.renderer.info.render;current.drawCalls=info.calls;current.triangles=info.triangles;current.renderScale=world.renderer.getPixelRatio();
   frames.push(current);if(frames.length>18000)frames.shift();current=null;
   if(performance.now()-lastPaint>1000){lastPaint=performance.now();const recent=frames.slice(-600),s=distribution(recent.map(f=>f.interval).filter(x=>x!==null));
    const stages=['simulation','render','ui','minimap','fog','traffic planning'].map(k=>`${k} ${distribution(recent.map(f=>f.stages[k]??0)).p95.toFixed(2)}`).join(' | ');
    const f=frames.at(-1);overlay.textContent=`frame p50/p95/p99/max ${[s.p50,s.p95,s.p99,s.max].map(n=>n.toFixed(1)).join('/')} ms\n>33 ${frames.filter(f=>f.interval>33).length}  >50 ${frames.filter(f=>f.interval>50).length}  longtasks ${tasks.length}\n${stages}\ndraw ${f.drawCalls}  triangles ${f.triangles}  scale ${f.renderScale.toFixed(2)}`;
   }
  },
  stop(){recording=false;current=null;last=null;},
  reset(){recording=true;frames=[];tasks=[];samples={};current=null;last=null;started=performance.now();observer?.takeRecords();},
  report(){return {frameClock:'performance.now at callback entry; rafFrameMs is the browser timestamp',started,ended:performance.now(),rafFrameMs:distribution(frames.map(f=>f.rafInterval).filter(x=>x!==null)),frameMs:distribution(frames.map(f=>f.interval).filter(x=>x!==null)),cpuMs:distribution(frames.map(f=>f.cpuMs)),
   over33:frames.filter(f=>f.interval>33).length,over50:frames.filter(f=>f.interval>50).length,longTasks:tasks,
   stages:Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,distribution(v)])),
   drawCalls:distribution(frames.map(f=>f.drawCalls)),triangles:distribution(frames.map(f=>f.triangles)),renderScale:distribution(frames.map(f=>f.renderScale)),
   worstFrames:frames.slice().sort((a,b)=>(b.interval??0)-(a.interval??0)).slice(0,100),frames};},
  download(){const url=URL.createObjectURL(new Blob([JSON.stringify(api.report())],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='wargame-perf.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);},
 };
 return api;
}
export const perf=enabled?createProfiler():null;
if(perf)globalThis.wargamePerf=perf;
