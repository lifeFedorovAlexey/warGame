// Metres and radians. Shared by the authoritative simulation and the renderer.
const rad=degrees=>degrees*Math.PI/180;
export const BUILDER={
 mount:[0,-.65,2.7],shoulder:[0,-.25,.45],upper:[0,.85,.60],
 boom:1.35,adapter:[0,-.08,0],tip:[0,-.02,-.27],
 stages:4,stroke:1.2,stageLength:1.35,
 limits:{yaw:[rad(-150),rad(150)],shoulder:[rad(-60),rad(65)],elbow:[rad(-250),0],wrist:[rad(-90),rad(90)],extension:[0,4.8]},
 rates:{yaw:rad(35),shoulder:rad(25),elbow:rad(35),wrist:rad(45),extension:.7},
};
const add=(a,b)=>a.map((x,i)=>x+b[i]),subtract=(a,b)=>a.map((x,i)=>x-b[i]),length=a=>Math.hypot(...a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const rx=(p,a)=>[p[0],p[1]*Math.cos(a)-p[2]*Math.sin(a),p[1]*Math.sin(a)+p[2]*Math.cos(a)];
const ry=(p,a)=>[p[0]*Math.cos(a)+p[2]*Math.sin(a),p[1],-p[0]*Math.sin(a)+p[2]*Math.cos(a)];
const rz=(p,a)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a),p[2]];
export const restJoints=()=>({yaw:0,shoulder:0,elbow:0,wrist:0,extension:0});
export function forwardBuilder(q){
 const shoulder=BUILDER.shoulder,elbow=add(shoulder,rx(BUILDER.upper,q.shoulder)),boomEnd=add(elbow,rx([0,-BUILDER.boom-q.extension,0],q.shoulder+q.elbow)),wrist=add(boomEnd,rx(BUILDER.adapter,q.shoulder+q.elbow)),tip=add(wrist,rx(BUILDER.tip,q.shoulder+q.elbow+q.wrist));
 return Object.fromEntries(Object.entries({shoulder,elbow,boomEnd,wrist,tip}).map(([key,p])=>[key,rz(p,q.yaw)]));
}
export function vehiclePose(unit,field,scale=4.5){
 const c=Math.cos(unit.heading),s=Math.sin(unit.heading),fieldCar=unit.kind==='command'||unit.kind==='raider';
 const width=fieldCar?.79:.70,rear=fieldCar?-1.29:-1.30,front=fieldCar?1.21:1.30;
 const height=(x,y)=>field.heightAt(unit.x+(x*c-y*s)*scale,unit.y+(x*s+y*c)*scale);
 const lf=height(-width,front),rf=height(width,front),lr=height(-width,rear),rr=height(width,rear);
 return{position:[unit.x,unit.y,(lf+rf+lr+rr)/4],heading:unit.heading,pitch:Math.atan((lf+rf-lr-rr)/(2*(front-rear)*scale)),roll:-Math.atan((rf+rr-lf-lr)/(4*width*scale)),scale};
}
export function vehicleToWorld(point,pose){return add(pose.position,rz(rx(ry(point,pose.roll),pose.pitch),pose.heading).map(x=>x*pose.scale));}
export function worldToVehicle(point,pose){return ry(rx(rz(subtract(point,pose.position).map(x=>x/pose.scale),-pose.heading),-pose.pitch),-pose.roll);}
export function worldDirectionToVehicle(direction,pose){return ry(rx(rz(direction,-pose.heading),-pose.pitch),-pose.roll);}
export function builderClearOfGround(q,pose,field){const points=forwardBuilder(q),segments=[['shoulder','elbow',.10],['elbow','boomEnd',.07],['boomEnd','wrist',.035],['wrist','tip',.02]];for(const [from,to,radius] of segments)for(let i=0;i<=12;i++){const local=points[from].map((v,axis)=>v+(points[to][axis]-v)*i/12),world=vehicleToWorld(add(local,BUILDER.mount),pose);if(world[2]-radius*pose.scale<field.heightAt(world[0],world[1])+.005)return false;}return true;}
export function builderClearOfTarget(q,pose,contact){
 const points=forwardBuilder(q),segments=[['shoulder','elbow',.12,.13],['elbow','boomEnd',.13,.035],['boomEnd','wrist',.035,.09],['wrist','tip',.09,0]];
 for(const [from,to,r0,r1] of segments)for(let i=0;i<=16;i++){const t=i/16,radius=r0+(r1-r0)*t,point=vehicleToWorld(add(points[from].map((v,axis)=>v+(points[to][axis]-v)*t),BUILDER.mount),pose),local=worldToVehicle(point,contact.collisionPose);
  const inside=local.every((v,axis)=>v>=contact.collisionBox.min[axis]-radius&&v<=contact.collisionBox.max[axis]+radius);if(!inside)continue;
  const clearance=point.reduce((sum,value,axis)=>sum+(value-contact.world[axis])*contact.normal[axis],0);if(clearance<radius*pose.scale-.0001)return false;
 }
 return true;
}

function segmentBox(a,b,min,max){
 let lo=0,hi=1;for(let axis=0;axis<3;axis++){const d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(a[axis]<min[axis]||a[axis]>max[axis])return false;continue;}const t0=(min[axis]-a[axis])/d,t1=(max[axis]-a[axis])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return false;}return true;
}
export function builderClearOfVehicle(q){
 const points=forwardBuilder(q),segments=[['shoulder','elbow',.12],['elbow','boomEnd',.12],['boomEnd','wrist',.065],['wrist','tip',.055]];
 for(const [from,to,radius] of segments){const a=add(points[from],BUILDER.mount),b=add(points[to],BUILDER.mount),min=[-1.0-radius,-2.2-radius,.5-radius],max=[1.0+radius,2.2+radius,2.67+radius];if(segmentBox(a,b,min,max))return false;}
 return true;
}
function withinLimits(q){return Object.entries(BUILDER.limits).every(([key,[min,max]])=>Number.isFinite(q[key])&&q[key]>=min-1e-7&&q[key]<=max+1e-7);}
function interpolate(a,b,t){return Object.fromEntries(Object.keys(a).map(key=>[key,a[key]+(b[key]-a[key])*t]));}

export function solveBuilderContact(target,normal=[0,-1,0]){
 const yaw=Math.atan2(-target[0],target[1]),r=Math.hypot(target[0],target[1]);if(yaw<BUILDER.limits.yaw[0]||yaw>BUILDER.limits.yaw[1])return null;
 const forward=[-Math.sin(yaw),Math.cos(yaw),0],intoRadial=-(normal[0]*forward[0]+normal[1]*forward[1]),intoZ=-normal[2],alignment=Math.hypot(intoRadial,intoZ);if(alignment<.75||intoRadial<.15)return null;
 const absoluteWrist=Math.atan2(intoZ,intoRadial)+Math.PI/2,offset=rx(BUILDER.tip,absoluteWrist),wristTarget=[r-offset[1],target[2]-offset[2]];
 for(const degrees of [10,0,-10,-20,25,40,-30,55,65,-40,-50]){
  const shoulder=rad(degrees),upper=rx(BUILDER.upper,shoulder),elbowY=BUILDER.shoulder[1]+upper[1],elbowZ=BUILDER.shoulder[2]+upper[2],dy=wristTarget[0]-elbowY,dz=wristTarget[1]-elbowZ,runSquared=dy*dy+dz*dz-BUILDER.adapter[2]**2;
  if(runSquared<=0)continue;const run=Math.sqrt(runSquared),extension=run-BUILDER.boom+BUILDER.adapter[1],baseAngle=Math.PI+Math.atan2(-BUILDER.adapter[2],run);let elbow=Math.atan2(dz,dy)-baseAngle-shoulder;while(elbow>0)elbow-=Math.PI*2;while(elbow<-Math.PI*2)elbow+=Math.PI*2;
  const wrist=angleDelta(absoluteWrist,shoulder+elbow),q={yaw,shoulder,elbow,wrist,extension};if(!withinLimits(q)||!builderClearOfVehicle(q))continue;
  const foldedWork={...q,extension:0},safe={yaw,shoulder:rad(25),elbow:rad(-145),wrist:0,extension:0};let clear=true;
  for(let i=0;i<=20;i++)if(!builderClearOfVehicle(interpolate(safe,foldedWork,i/20))||!builderClearOfVehicle({...q,extension:extension*i/20})){clear=false;break;}
  if(!clear)continue;const fk=forwardBuilder(q),error=length(subtract(fk.tip,target));if(error>.0001)continue;return{q,error,alignment,tip:fk.tip};
 }
 return null;
}

export function createBuilderState(){return{q:restJoints(),phase:'stowed',targetId:null,ready:false,progress:0};}
function near(a,b){return Object.keys(a).every(key=>Math.abs(a[key]-b[key])<(key==='extension'?.002:.001));}
function approach(q,target,dt){const next={...q};for(const key of Object.keys(q)){const delta=target[key]-q[key];next[key]+=Math.sign(delta)*Math.min(Math.abs(delta),BUILDER.rates[key]*dt);}return next;}
export function stepBuilderRig(state,solution,dt,targetId=null,clearance=null){
 const q=state.q;state.ready=false;
 if(solution&&state.targetId&&state.targetId!==targetId)solution=null;
 if(!solution&&state.phase!=='stowed'&&!state.phase.startsWith('fold-'))state.phase='fold-retract';
 if(solution&&state.phase==='stowed'){state.phase='lift';state.targetId=targetId;}
 const safe={yaw:q.yaw,shoulder:rad(25),elbow:rad(-145),wrist:0,extension:0};let target;
 switch(state.phase){
  case 'stowed':state.progress=0;state.targetId=null;return state;
  case 'lift':target={...restJoints(),shoulder:rad(25)};break;
  case 'unfold':target={...safe,yaw:solution.q.yaw};break;
  case 'aim':target={...solution.q,extension:0};break;
  case 'extend':case 'work':target=solution.q;break;
  case 'fold-retract':target={...q,extension:0};break;
  case 'fold-raise':target=safe;break;
  case 'fold-close':target={...restJoints(),shoulder:rad(25)};break;
  case 'fold-lower':target=restJoints();break;
  default:throw new Error('Unknown U25 phase: '+state.phase);
 }
 const next=approach(q,target,dt);if(!builderClearOfVehicle(next)||clearance&&!clearance(next)) {state.blocked='clearance';state.phase='fold-retract';return state;}
 state.q=next;state.blocked=null;
 const transitions={lift:'unfold',unfold:'aim',aim:'extend',extend:'work','fold-retract':'fold-raise','fold-raise':'fold-close','fold-close':'fold-lower','fold-lower':'stowed'};
 if(near(next,target)){if(state.phase==='work')state.ready=true;else state.phase=transitions[state.phase]??state.phase;}
 state.progress=state.phase==='stowed'?0:state.ready?1:state.phase.startsWith('fold-')?.35:{lift:.1,unfold:.3,aim:.5,extend:.8,work:.99}[state.phase];
 return state;
}

export function desiredBuilderHeading(target,isUnit){return (isUnit?target.heading:target.rotation)-Math.PI/2;}
export function buildingWorkRail(spec){const w=spec.realSizeMetres[0],d=spec.realSizeMetres[1];return{width:w*.65,depth:.12,height:.18,position:[0,-d/2-.03,.4],normal:[0,-1,0]};}

export function workContact(unit,target,config,field){
 const pose=vehiclePose(unit,field,config.worldScale),flangeWorld=vehicleToWorld(BUILDER.mount,pose),isUnit=!!config.units[target.kind],angle=isUnit?target.heading:target.rotation,c=Math.cos(angle),s=Math.sin(angle),scale=config.worldScale,dx=(flangeWorld[0]-target.x)/scale,dy=(flangeWorld[1]-target.y)/scale;
 const localX=dx*c+dy*s;let localPoint,normal=[s,-c,0],world,collisionPose,collisionBox;
 if(isUnit){
  // B01 rear steel skin below the windows, away from lights, hinges and handles.
  localPoint=[clamp(localX,-.62,.62),-2.021,1.85];
  const targetPose=vehiclePose(target,field,scale);world=vehicleToWorld(localPoint,targetPose);const origin=vehicleToWorld([0,0,0],targetPose),tip=vehicleToWorld([0,-1,0],targetPose);normal=subtract(tip,origin).map(x=>x/scale);collisionPose=targetPose;collisionBox={min:[-1.1,-2.5,.3],max:[1.1,2.5,2.75]};
 }else{
  const spec=config.buildings[target.kind],rail=buildingWorkRail(spec);localPoint=[clamp(localX,-rail.width/2+.12,rail.width/2-.12),rail.position[1]-rail.depth/2,rail.position[2]];world=[target.x+(localPoint[0]*c-localPoint[1]*s)*scale,target.y+(localPoint[0]*s+localPoint[1]*c)*scale,(target.groundHeight??field.heightAt(target.x,target.y))+localPoint[2]*scale];collisionPose={position:[target.x,target.y,target.groundHeight??field.heightAt(target.x,target.y)],heading:target.rotation,pitch:0,roll:0,scale};collisionBox={min:[-spec.realSizeMetres[0]/2,-spec.realSizeMetres[1]/2-.1,0],max:[spec.realSizeMetres[0]/2,spec.realSizeMetres[1]/2,Math.max(.49,spec.realSizeMetres[2]*(target.completed?1:.1+.9*target.progress))]};
 }
 world=add(world,normal.map(x=>x*.002*scale));const local=subtract(worldToVehicle(world,pose),BUILDER.mount),solution=solveBuilderContact(local,worldDirectionToVehicle(normal,pose));if(!solution||!builderClearOfGround(solution.q,pose,field))return null;
 const result={...solution,world,normal,local,targetId:target.id,collisionPose,collisionBox};return builderClearOfTarget(solution.q,pose,result)?result:null;
}
