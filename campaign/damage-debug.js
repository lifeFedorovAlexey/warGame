// Optional tools in the real mission: /campaign/?damage=1
export function installDamageDebug(T,world,mission,campaign){
  const panel=document.createElement('aside');panel.id='damage-debug';
  panel.style.cssText='position:absolute;right:18px;top:72px;z-index:80;width:290px;padding:14px;background:#1d2423ed;color:#e5dfc9;border:1px solid #7d8066;font:13px system-ui;box-shadow:0 5px 25px #0008;max-height:80vh;overflow:auto';
  panel.innerHTML=`<strong>Проверка повреждений</strong><p style="margin:8px 0">Shift + клик — попадание в поверхность.</p><select data-target style="width:100%"></select><select data-part style="width:100%;margin:6px 0"><option value="">Кузов / стена</option></select><select data-type style="width:100%"><option value="bullet">Пуля · 8</option><option value="burst">Очередь · 8 × 8</option><option value="shell">Снаряд · 85</option><option value="collision">Удар · 150</option><option value="fire">Огонь · 50</option></select><div style="display:flex;gap:6px;margin:8px 0"><button data-fire>Попадание</button><button data-kill>Уничтожить</button></div><div style="display:flex;gap:6px"><button data-near>Близко</button><button data-mid>Средне</button><button data-far>Далеко</button></div><label style="display:block;margin:8px 0"><input data-enabled type="checkbox" checked> Отображать повреждения</label><button data-export>Скачать состояние</button><pre data-stats style="white-space:pre-wrap;font-size:11px"></pre>`;
  document.body.append(panel);
  const targetSelect=panel.querySelector('[data-target]'),partSelect=panel.querySelector('[data-part]'),types=panel.querySelector('[data-type]');
  const all=()=>[...mission.state.units,...mission.state.buildings],find=id=>all().find(e=>e.id===id);
  let lastIds='',lastPartTarget='';
  function selectTarget(id){refresh();targetSelect.value=id;lastPartTarget='';refresh();}
  function refresh(){
    const entities=all().filter(e=>e.owner==='rai'||mission.visibleAt(e.x,e.y)),ids=entities.map(e=>e.id).join(',');
    if(ids!==lastIds){const old=targetSelect.value;targetSelect.replaceChildren(...entities.map(e=>new Option(e.id+' · '+e.kind,e.id)));if(find(old))targetSelect.value=old;lastIds=ids;}
    const entity=find(targetSelect.value);
    if(entity&&lastPartTarget!==entity.id){
      const template=world.damage.getTemplate(entity),available=new Set(template?.bindings.flatMap(b=>b.parts)??[0]);
      partSelect.replaceChildren(...Object.entries(template?.parts??{}).filter(([id])=>available.has(Number(id))).map(([id,p])=>new Option(p.name,id)));lastPartTarget=entity.id;
    }
    const s=world.damage.statistics;panel.querySelector('[data-stats]').textContent=`HP: ${Math.round(entity?.hp??0)} · попаданий: ${entity?.damage?.hits??0}\nLOD: ${world.damage.records.get(entity?.id)?.lod??'—'} · draw calls: ${world.statistics.drawCalls}\nОбновлений геометрии: ${s.geometryUpdates}\nСтрок атласа: ${s.textureRows} · активных обломков: ${s.activePhysics}/${s.activePhysicsLimit}`;
  }
  function localRayForPart(entity,partId,side='front'){
    const template=world.damage.getTemplate(entity),dir={front:[0,1,0],rear:[0,-1,0],left:[-1,0,0],right:[1,0,0],roof:[0,0,1]}[side]??[0,1,0];
    const transforms=template.pose?.(entity);
    let point=null,normal=null,matchedPart=false;
    const candidates=[];
    const choosePart=partId!==0||!mission.config.units[entity.kind];
    if(choosePart){
      for(const binding of template.bindings){
        const g=binding.geometry,p=g.attributes.damagePosition,n=g.attributes.damageNormal,a=g.attributes.damagePart,idx=g.index;
        for(let i=0;i<(idx?.count??p.count);i+=3){const ids=[0,1,2].map(j=>idx?idx.getX(i+j):i+j);if(Math.round(a.getX(ids[0]))!==partId)continue;
          let candidate=[0,1,2].map(k=>ids.reduce((s,id)=>s+p.array[id*3+k],0)/3),nv=[0,1,2].map(k=>ids.reduce((s,id)=>s+n.array[id*3+k],0)/3);
          const motion=transforms?.get(binding);if(motion){candidate=new T.Vector3(...candidate).applyMatrix4(motion).toArray();nv=new T.Vector3(...nv).applyMatrix3(new T.Matrix3().getNormalMatrix(motion)).normalize().toArray();}
          if(Math.hypot(...nv)<.5)continue;
          const length=Math.hypot(...nv),outward=Math.hypot(candidate[0],candidate[1],candidate[2]-1.3)||1;
          const score=(nv[0]*candidate[0]+nv[1]*candidate[1]+nv[2]*(candidate[2]-1.3))/length/outward;
          candidates.push({point:candidate,normal:nv.map(v=>v/length),score});}
      }
      candidates.sort((a,b)=>b.score-a.score);
      for(const candidate of candidates){
        const from=candidate.point.map((v,i)=>v+candidate.normal[i]*.8),direction=candidate.normal.map(v=>-v);
        const hit=template.collider.trace(from,direction,entity.damage,transforms);
        if(hit?.partId===partId){point=candidate.point;normal=candidate.normal;matchedPart=true;break;}
      }
      if(!matchedPart)return null;
    }
    if(!point){const mobile=!!mission.config.units[entity.kind],bounds=template.collider.bounds;point=mobile?[0,.1,1.72]:bounds.min.map((v,i)=>(v+bounds.max[i])/2);normal=dir;}
    const length=Math.hypot(...normal);normal=normal.map(v=>v/length);
    const radius=matchedPart?.8:Math.max(8,...template.collider.bounds.max.map((v,i)=>v-template.collider.bounds.min[i]));
    const from=point.map((v,i)=>v+normal[i]*radius),matrix=world.damage.matrixFor(entity).clone();
    return {from:new T.Vector3(...from).applyMatrix4(matrix).toArray(),direction:new T.Vector3(...normal.map(x=>-x)).transformDirection(matrix).toArray()};
  }
  function hit(id,options={}){
    const entity=find(id);if(!entity||entity.hp<=0)return null;
    const type=options.type??'bullet',power=options.power??({bullet:8,burst:8,shell:85,collision:150,fire:50}[type]??8),count=options.count??(type==='burst'?8:1);
    let result=null;
    for(let i=0;i<count;i++){
      if(mission.damageEnabled===false){mission.damage(entity,power,null);continue;}
      const ray=options.from?{from:options.from,direction:options.direction}:localRayForPart(entity,Number(options.partId??0),options.side);
      if(!ray)return null;
      if(type==='burst'){
        const dir=new T.Vector3(...ray.direction),right=new T.Vector3().crossVectors(dir,new T.Vector3(0,0,1));if(right.lengthSq()<.01)right.set(1,0,0);right.normalize();
        const up=new T.Vector3().crossVectors(right,dir).normalize(),spread=mission.config.worldScale;
        const offset=right.multiplyScalar(Math.sin(i*2.399)*.16*spread).addScaledVector(up,Math.cos(i*1.73)*.09*spread);
        ray.from=ray.from.map((v,k)=>v+offset.getComponent(k));
      }
      const contact=world.damage.trace(entity,ray.from,ray.direction);if(!contact)return null;
      result=mission.damage(entity,power,null,{...contact,type:type==='burst'?'bullet':type});
    }
    return result?{entityId:id,partId:result.partId,point:result.point,worldPoint:result.worldPoint,normal:result.worldNormal,type,power,hits:entity.damage.hits}:null;
  }
  function view(id,distance=42){const entity=find(id);if(!entity)return;world.controls.minDistance=18;world.minimumCameraHeight=3;const z=entity.groundHeight??world.field.heightAt(entity.x,entity.y),bounds=world.damage.getTemplate(entity)?.collider.bounds,height=mission.config.units[entity.kind]?7:bounds?(bounds.min[2]+bounds.max[2])*.5*mission.config.worldScale:7;world.controls.target.set(entity.x,entity.y,z+height);world.camera.position.set(entity.x+distance*.68,entity.y+distance*.62,z+height+distance*.43);world.controls.update();}
  targetSelect.onchange=()=>{lastPartTarget='';refresh();};
  panel.querySelector('[data-fire]').onclick=()=>{hit(targetSelect.value,{type:types.value,partId:Number(partSelect.value)});refresh();};
  panel.querySelector('[data-kill]').onclick=()=>{const e=find(targetSelect.value);if(e)hit(e.id,{type:'shell',power:e.hp,partId:Number(partSelect.value)});};
  for(const [key,distance] of [['near',42],['mid',430],['far',1300]])panel.querySelector('[data-'+key+']').onclick=()=>view(targetSelect.value,distance);
  panel.querySelector('[data-enabled]').onchange=e=>world.damage.enabled=e.target.checked;
  panel.querySelector('[data-export]').onclick=()=>{const entity=find(targetSelect.value),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({id:entity.id,damage:entity.damage},null,2)],{type:'application/json'}));a.download='damage-'+entity.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  world.renderer.domElement.addEventListener('pointerdown',event=>{
    if(!event.shiftKey||event.button!==0)return;
    event.preventDefault();event.stopImmediatePropagation();
    const rect=world.renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),world.camera);
    let nearest=null,target=null;
    for(const entity of all()){if(entity.hp<=0||entity.owner!=='rai'&&!mission.visibleAt(entity.x,entity.y))continue;const contact=world.damage.trace(entity,ray.ray.origin.toArray(),ray.ray.direction.toArray());if(contact){const d=ray.ray.origin.distanceTo(new T.Vector3(...contact.worldPoint));if(!nearest||d<nearest.distance){nearest={...contact,distance:d};target=entity;}}}
    if(target){selectTarget(target.id);hit(target.id,{type:types.value,from:ray.ray.origin.toArray(),direction:ray.ray.direction.toArray()});}
  },true);
  const timer=setInterval(refresh,500);refresh();
  return {hit,view,selectTarget,localRayForPart,panel,refresh,dispose(){clearInterval(timer);panel.remove();}};
}
