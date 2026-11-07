import fs from 'node:fs';
const path=process.argv[2];if(!path)throw Error('Usage: node tools/summarize-cpu-profile.mjs <file.cpuprofile>');
const profile=JSON.parse(fs.readFileSync(path)),nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map(),self=new Map(),inclusive=new Map();
for(const node of nodes.values())for(const child of node.children??[])parents.set(child,node.id);
const key=node=>`${node.callFrame.functionName||'(anonymous)'} ${node.callFrame.url}:${node.callFrame.lineNumber+1}`;
for(const [index,id] of profile.samples.entries()){
 const dt=(profile.timeDeltas[index]??0)/1000,label=key(nodes.get(id));self.set(label,(self.get(label)??0)+dt);
 const seen=new Set();let ancestor=id;
 while(ancestor!==undefined){const name=key(nodes.get(ancestor));if(!seen.has(name)){inclusive.set(name,(inclusive.get(name)??0)+dt);seen.add(name);}ancestor=parents.get(ancestor);}
}
const top=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,35).map(([functionName,ms])=>({functionName,ms:+ms.toFixed(2)}));
console.log(JSON.stringify({path,durationMs:(profile.endTime-profile.startTime)/1000,self:top(self),inclusive:top(inclusive)},null,2));
