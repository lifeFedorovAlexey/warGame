const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const validator=require('gltf-validator');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:8766/campaign/');
  const data=await page.evaluate(async ()=>{
   const [T,{createFlamerModule},{GLTFExporter}]=await Promise.all([
    import('three'),import('./flamer-module.js'),import('../demo/vendor/exporters/GLTFExporter.js'),
   ]);
   const {root,pitch,yaw,muzzle}=createFlamerModule(T),bounds=new T.Box3().setFromObject(root);
   let triangles=0;
   root.traverse(node=>{if(node.isMesh)triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;});
   const buffer=await new GLTFExporter().parseAsync(root,{binary:true});
   return {file:Array.from(new Uint8Array(buffer)),min:bounds.min.toArray(),max:bounds.max.toArray(),
    anchors:[root.getObjectByName('mount'),yaw,pitch,muzzle].map(node=>[node.name,node.getWorldPosition(new T.Vector3()).toArray()]),triangles};
  });
  const bytes=Uint8Array.from(data.file),report=await validator.validateBytes(bytes);
  assert.equal(report.issues.numErrors+report.issues.numWarnings,0,JSON.stringify(report.issues.messages));
  assert(data.triangles<3200);
  const dir='assets/vehicles/field-flamer';
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(dir+'/field-flamer.glb',bytes);
  const {file,...measurements}=data;
  console.log(JSON.stringify(measurements));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
