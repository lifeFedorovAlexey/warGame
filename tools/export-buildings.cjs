const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const validator = require('gltf-validator');
const {chromium} = require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async()=>{
  const config = JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
  const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8766/campaign/builder.html');
    await page.waitForFunction(()=>window.builderPreview?.ready);
    const modules = await page.evaluate(async config => {
      const T = await import('three');
      const {createBuildingPrefab} = await import('./prefabs.js');
      const {createProductionExporter} = await import('../demo/production-kit.js');
      const result=[];
      for(const [kind,spec] of Object.entries(config.buildings)){
        const root=createBuildingPrefab(T,kind,spec);
        root.updateMatrixWorld(true);
        const bounds=new T.Box3().setFromObject(root);
        const exported=await createProductionExporter({[kind]:root},0)();
        const anchors=Object.fromEntries(root.children.filter(c=>c.name.endsWith('_anchor')||['work_contact','muzzle'].includes(c.name)).map(c=>[c.name,c.position.toArray()]));
        result.push({kind,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},anchors,exported,art:root.userData.artStatus});
      }
      return result;
    },config);
    const manifest={status:'campaign-models',units:'metres',axes:'X right, Y forward, Z up',source:'assets/campaign/alpha/mission01/gameplay.json',buildings:[]};
    for(const model of modules){
      const spec=config.buildings[model.kind],directory=path.join('assets/blueprints/buildings',model.kind);
      for(let axis=0;axis<2;axis++){
        assert(model.bounds.min[axis]>=-spec.footprintMetres[axis]/2-.001,model.kind+' minimum footprint');
        assert(model.bounds.max[axis]<=spec.footprintMetres[axis]/2+.001,model.kind+' maximum footprint');
      }
      assert(model.bounds.min[2]>=-.001&&model.bounds.max[2]<=spec.realSizeMetres[2]+.001,model.kind+' height');
      assert.deepEqual(model.anchors.work_anchor,spec.workAnchor);
      if(spec.exitAnchor)assert.deepEqual(model.anchors.exit_anchor,spec.exitAnchor);
      const file=model.exported.files[0],bytes=Buffer.from(file.base64,'base64');
      const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:model.kind+'.glb'});
      assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
      assert.equal(validation.issues.numWarnings,0,JSON.stringify(validation.issues));
      const reference=model.art==='industrial-atlas'?'references/buildings/industrial-atlas.png':undefined;
      const data={
        id:model.kind,name:spec.name,status:model.art,reference,units:'metres',axes:'X right,Y forward,Z up',
        nominalEnvelope:spec.realSizeMetres,reservedFootprint:spec.footprintMetres,measuredBounds:model.bounds,
        anchors:model.anchors,
        construction:{base:'building_foundation',body:'building_structure',mode:'horizontal-reveal',layerMetres:.24},
        collision:{type:'box',width:spec.footprintMetres[0],depth:spec.footprintMetres[1],height:spec.realSizeMetres[2]},
        validation:{errors:0,warnings:0},geometry:model.exported.report[0],
      };
      fs.mkdirSync(directory,{recursive:true});
      fs.writeFileSync(path.join(directory,'prototype.glb'),bytes);
      fs.writeFileSync(path.join(directory,'module.json'),JSON.stringify(data,null,2)+'\n');
      const notes=[
        '# '+spec.name,
        reference?'Модель для кампании по [промышленному атласу](../../../../'+reference+').':'Модель для кампании.',
        'Габарит '+spec.realSizeMetres.join(' × ')+' м. Пятно '+spec.footprintMetres.join(' × ')+' м. Масштаб на карте Alpha ×'+config.worldScale+'.',
        'Основание остаётся на месте. Излучатель открывает геометрию корпуса горизонтальными слоями по 0,24 м. work_anchor задаёт зону строителя. work_contact сохраняет положение стальной планки для стенда обслуживания.',
        spec.exitAnchor?'Зона выезда и точка сбора связаны с exit_anchor.':'',
        model.kind==='derrick'?'Балансир, кривошип, шатун и шток анимирует campaign/oil-pump.js.':'',
        model.kind==='bunker'?'Низкий бетонный каземат с утопленной амбразурой. Трассер и вспышка начинаются в точке muzzle.':'',
      ].filter(Boolean);
      fs.writeFileSync(path.join(directory,'README.md'),notes.join('\n\n')+'\n');
      manifest.buildings.push({id:model.kind,path:model.kind+'/prototype.glb',spec:model.kind+'/module.json',triangles:data.geometry.triangles,bytes:bytes.length});
    }
    fs.writeFileSync('assets/blueprints/buildings/manifest.json',JSON.stringify(manifest,null,2)+'\n');
    console.log(JSON.stringify(manifest));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
