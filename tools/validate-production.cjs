const fs=require('node:fs');const path=require('node:path');const validator=require('gltf-validator');
const root=path.resolve(__dirname,'..');
(async()=>{
 const geometry=JSON.parse(fs.readFileSync(path.join(root,'assets/vehicles/geometry-report.json'),'utf8'));const results=[];
 for(const entry of geometry){
  const name=`${entry.id}/${entry.id}-lod${entry.lod}.glb`,bytes=fs.readFileSync(path.join(root,'assets/vehicles',name));
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:name,writeTimestamp:false,maxIssues:100});
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8').trim());
  const nodeNames=doc.nodes.map(n=>n.name||'');const required=entry.id==='B01'?['mount','upper_mount']:['body_mount','sprung_frame','axle_1_L_wheel','axle_2_R_wheel'];
  for(const n of required)if(!nodeNames.includes(n))throw new Error(name+' missing '+n);
  if(entry.id==='C01'&&nodeNames.includes('B01_BUKHANKA'))throw new Error('Body leaked into chassis');
  if(entry.id==='B01'&&nodeNames.includes('U01_KORD'))throw new Error('Weapon leaked into body');
  const specFolder=entry.id==='B01'?'bodies/B01-bukhanka':'running-gear/C01-dvor';
  const spec=JSON.parse(fs.readFileSync(path.join(root,'references',specFolder,'module.json'),'utf8'));
  for(let axis=0;axis<3;axis++)if(entry.boundsMm.min[axis]<spec.bounds_mm.min[axis]-1||entry.boundsMm.max[axis]>spec.bounds_mm.max[axis]+1)throw new Error(name+' exceeds specified bounds');
  if(report.issues.numErrors||report.issues.numWarnings){console.error(JSON.stringify(report.issues));throw new Error(name+' failed validation');}
  results.push({file:name,triangles:entry.triangles,vertices:entry.vertices,primitives:entry.primitives,errors:report.issues.numErrors,warnings:report.issues.numWarnings,info:report.issues.messages.filter(m=>m.severity>=2).map(m=>m.code)});
 }
 for(const id of ['B01','C01']){const e=geometry.filter(e=>e.id===id).sort((a,b)=>a.lod-b.lod);if(!(e[0].triangles>e[1].triangles&&e[1].triangles>e[2].triangles))throw new Error('Invalid LOD progression');}
 fs.writeFileSync(path.join(root,'assets/vehicles/validation-report.json'),JSON.stringify({validator:validator.version(),assets:results},null,2)+'\n');console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exit(1)});
