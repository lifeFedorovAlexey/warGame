const colors = {guidance:'#dfce91',threat:'#dc9373',intel:'#d7b775',anomaly:'#afcbea'};
const duration = 7;

function ionTrail(T) {
  const canvas=document.createElement('canvas');
  canvas.width=128;canvas.height=256;
  const ctx=canvas.getContext('2d');
  const halo=ctx.createRadialGradient(64,214,0,64,214,61);
  halo.addColorStop(0,'rgba(142,172,255,.64)');
  halo.addColorStop(.42,'rgba(104,109,219,.32)');
  halo.addColorStop(1,'rgba(104,109,219,0)');
  ctx.fillStyle=halo;
  ctx.save();ctx.translate(0,103);ctx.scale(1,.55);ctx.fillRect(0,138,128,148);ctx.restore();

  const glow=ctx.createLinearGradient(0,19,0,230);
  glow.addColorStop(0,'rgba(140,169,255,0)');
  glow.addColorStop(.38,'rgba(121,147,242,.42)');
  glow.addColorStop(.87,'rgba(196,211,255,.91)');
  glow.addColorStop(1,'rgba(233,237,255,0)');
  for(const [width,blur,alpha] of [[12,17,.53],[5,6,.67],[1.5,0,.9]]){
    ctx.beginPath();
    ctx.moveTo(55,217);ctx.bezierCurveTo(80,175,49,138,67,112);ctx.bezierCurveTo(78,89,57,62,66,30);
    ctx.shadowColor='#8f9aff';ctx.shadowBlur=blur;ctx.globalAlpha=alpha;
    ctx.strokeStyle=glow;ctx.lineWidth=width;ctx.stroke();
  }
  const map=new T.CanvasTexture(canvas);
  map.colorSpace=T.SRGBColorSpace;
  return map;
}

export function createStorySignals(T, scene, field) {
  const ringGeometry=new T.RingGeometry(12,13.3,40);
  const ringPosition=ringGeometry.getAttribute('position'),flat=ringPosition.array.slice();
  const ring=new T.Mesh(ringGeometry,new T.MeshBasicMaterial({
    transparent:true,depthWrite:false,side:T.DoubleSide,
  }));
  const column=new T.Mesh(new T.PlaneGeometry(110,204),new T.MeshBasicMaterial({
    map:ionTrail(T),transparent:true,depthWrite:false,side:T.DoubleSide,
    blending:T.AdditiveBlending,forceSinglePass:true,toneMapped:false,
  }));
  column.geometry.rotateX(Math.PI/2);
  ring.name='field_signal_ring';column.name='southern_energy_trace';
  ring.visible=column.visible=false;
  scene.add(ring,column);
  const spill={value:new T.Vector3()},observer={value:new T.Vector2()};
  let current=null,born=0;

  function show(signal, now=performance.now()/1000) {
    current=signal;
    born=now;
    ring.visible=column.visible=false;
    spill.value.z=0;
    if(!signal)return;
    const {x,y,kind}=signal,height=field.heightAt(x,y);
    if(kind==='anomaly'){
      column.position.set(x,y,height+93);
      spill.value.set(x,y,0);
      return;
    }
    const scale=kind==='intel'?1.65:1;
    ring.position.set(x,y,0);
    ring.material.color.set(colors[kind]);
    for(let i=0;i<ringPosition.count;i++){
      const dx=flat[i*3]*scale,dy=flat[i*3+1]*scale;
      ringPosition.setXYZ(i,dx,dy,field.heightAt(x+dx,y+dy)+.8);
    }
    ringPosition.needsUpdate=true;
    ring.geometry.computeBoundingSphere();
  }

  function update(mission, camera, now) {
    const age=now-born;
    if(current&&age>=duration)show(null,now);
    if(!current)return;
    if(current.kind==='anomaly'){
      column.visible=true;
      observer.value.set(camera.position.x,camera.position.y);
      column.rotation.z=Math.atan2(camera.position.y-current.y,camera.position.x-current.x)+Math.PI/2;
      const burst=Math.exp(-Math.pow((age-.44)/.53,2));
      const fade=Math.max(0,1-age/duration);
      column.material.opacity=Math.min(1,burst*.48+fade*(.37+.09*Math.sin(age*15)));
      spill.value.z=Math.min(.86,burst*.46+fade*.36);
    }else{
      ring.visible=mission.exploredAt(current.x,current.y);
      ring.material.opacity=.60+.24*Math.sin(age*4.8);
    }
  }

  function drawMap(ctx,size) {
    if(!current)return;
    const [x,y]=field.worldToGrid(current.x,current.y);
    ctx.save();
    ctx.strokeStyle=colors[current.kind];ctx.lineWidth=1.2;
    ctx.beginPath();ctx.arc(x*size/127,y*size/127,4.5,0,2*Math.PI);ctx.stroke();
    ctx.restore();
  }

  return {show,update,drawMap,spill,observer,get current(){return current;}};
}
