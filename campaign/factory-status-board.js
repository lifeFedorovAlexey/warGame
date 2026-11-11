import {factoryRepairQueue} from './factory-routing.js';
import {oilOrderProgress,oilFundingRemaining} from './oil-economy.js';

export function factoryBoardState(m,f){
 const job=f.queue[0],repair=f.activeRepair;
 return {repairs:factoryRepairQueue(m,f).length,orders:f.queue.length,
  priority:f.workPriority??'repair',active:repair?'repair':job&&!f.productionPaused&&!f.exitBlocked
   &&(oilFundingRemaining(job)===0||m.state.energy>0)?'production':null,
  repair:repair?.progress??0,production:job?oilOrderProgress(job,m.config.units[job.kind].seconds,m.config).progress:0};
}

// A painted workshop tally, physically mounted on the roof. It follows the
// building's scale/rotation and depth, rather than covering the map as HUD.
export function createFactoryStatusBoards(T,addFog,removeFog=()=>{}){
 const boards=new Map();
 function make(model){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  texture.anisotropy=4;
  const paint=new T.MeshStandardMaterial({map:texture,roughness:1,metalness:0}),steel=new T.MeshStandardMaterial({color:'#655d50',roughness:1});
  addFog(paint);addFog(steel);
  const [w,d,h]=model.userData.dimensionsMetres??[26,20,9];
  const root=new T.Group();root.name='factory_status_board';root.position.set(-w*.117,-d*.79*.16,.35+h*.59+.23);
  // Low sheet metal fits between the existing roof monitors, flush with the
  // workshop roof instead of hiding its silhouette behind a raised board.
  const width=w*.37,depth=d*.10;
  // Paint the top face of the plate itself. A second plane only 5 mm above
  // it loses depth precision as the camera pulls back and flickers into steel.
  const geometry=new T.BoxGeometry(width,depth,.08),indices=Array.from(geometry.index.array);
  const top=geometry.groups.find(g=>g.materialIndex===4);
  const sides=geometry.groups.filter(g=>g!==top).flatMap(g=>indices.slice(g.start,g.start+g.count));
  geometry.setIndex([...sides,...indices.slice(top.start,top.start+top.count)]);
  // Keep one draw for the metal and one for the painted face.
  geometry.clearGroups();geometry.addGroup(0,sides.length,0);geometry.addGroup(sides.length,top.count,1);
  const plate=new T.Mesh(geometry,[steel,paint]);root.add(plate);
  model.add(root);
  return {root,ctx,texture,materials:[paint,steel],key:null};
 }
 function draw(b,s){
  const c=b.ctx;c.fillStyle='#3d3d34';c.fillRect(0,0,512,128);
  c.fillStyle='#696052';for(let i=0;i<18;i++)c.fillRect((i*137)%512,(i*71)%128,2+i%5,1);
  for(const x of [9,503])for(const y of [9,119]){c.fillStyle='#8c806a';c.beginPath();c.arc(x,y,2,0,Math.PI*2);c.fill();}
  for(const [column,label,count,key,progress] of [[0,'Р',s.repairs,'repair',s.repair],[1,'С',s.orders,'production',s.production]]){
   const x=column*256;c.fillStyle='#e1d1a9';c.font='900 102px "Arial Black", sans-serif';c.textBaseline='alphabetic';c.fillText(label,x+28,98);
   c.fillStyle=s.active===key?'#edbb70':count?'#e1d1a9':'#aca18a';
   c.font='900 110px "Arial Black", sans-serif';c.textAlign='right';c.fillText(count?String(count):'—',x+239,98,124);c.textAlign='left';
   // A small painted pointer marks priority; short segments show progress.
   if(s.priority===key){c.fillStyle='#c5a877';c.beginPath();c.moveTo(x+8,49);c.lineTo(x+21,58);c.lineTo(x+8,67);c.fill();}
   for(let i=0;i<6;i++){c.fillStyle=i<Math.floor(progress*6)?'#c9a265':'#77705e';c.fillRect(x+30+i*33,111,27,7);}
  }
  b.texture.needsUpdate=true;
 }
 function dispose(b){b.root.removeFromParent();b.root.traverse(n=>n.geometry?.dispose());b.texture.dispose();b.materials.forEach(m=>{removeFog(m);m.dispose();});}
 return {update(m,models){
  const alive=new Set();
  for(const f of m.state.buildings){
   if(f.kind!=='factory'||f.owner!=='rai'||f.hp<=0||!f.completed)continue;
   const model=models.get(f.id);if(!model)continue;alive.add(f.id);
   let b=boards.get(f.id);if(b&&b.root.parent!==model){dispose(b);boards.delete(f.id);b=null;}
   if(!b){b=make(model);boards.set(f.id,b);}
   const s=factoryBoardState(m,f),key=JSON.stringify({...s,repair:Math.floor(s.repair*6),production:Math.floor(s.production*6)});
   b.root.userData.status=s;
   if(b.key!==key){b.key=key;draw(b,s);}
  }
  for(const [id,b] of boards)if(!alive.has(id)){dispose(b);boards.delete(id);}
 }};
}
