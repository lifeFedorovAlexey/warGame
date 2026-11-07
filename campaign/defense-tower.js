import {buildKord} from '../demo/kord.js';
import {vehicleKit,batchRigidMeshes} from './field-vehicles.js';

export function buildDefenseTower(T,[w,d,h],{box,rod,cylinder,mesh,part},materials){
  const {paint,steel,concrete,dark}=materials,deck=h*.72;
  const beam=(a,b,width,depth=width)=>{
    const start=new T.Vector3(...a),end=new T.Vector3(...b),axis=end.clone().sub(start);
    const g=new T.BoxGeometry(width,depth,axis.length());
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),axis.normalize()));
    mesh(g,steel,start.add(end).multiplyScalar(.5).toArray());
  };
  const foot=w*.32,head=w*.25;
  for(const sx of [-1,1])for(const sy of [-1,1]){
    box([.98,.98,.43],[sx*foot,sy*foot,.50],concrete);
    box([.72,.72,.11],[sx*foot,sy*foot,.77],steel);
    beam([sx*foot,sy*foot,.81],[sx*head,sy*head,deck],.32);
    for(const dx of [-.23,.23])for(const dy of [-.23,.23])cylinder(.043,.08,[sx*foot+dx,sy*foot+dy,.86],dark);
  }
  for(const z of [3.1,5.7,deck-.13]){
    const r=foot+(head-foot)*(z-.8)/(deck-.8);
    for(const side of [-1,1]){
      beam([-r,side*r,z],[r,side*r,z],.15,.19);
      beam([side*r,-r,z],[side*r,r,z],.15,.19);
    }
  }
  for(const [bottom,top] of [[.95,3.1],[3.1,5.7],[5.7,deck-.15]]){
    const r0=foot+(head-foot)*bottom/deck,r1=foot+(head-foot)*top/deck;
    for(const side of [-1,1]){
      beam([-r0,side*r0,bottom],[r1,side*r1,top],.105);
      beam([side*r0,r0,bottom],[side*r1,-r1,top],.105);
    }
  }
  box([5.10,4.93,.20],[0,0,deck],steel);
  for(const x of [-1.65,0,1.65])box([.15,4.90,.29],[x,0,deck-.22],steel);
  for(let y=-2.24;y<2.3;y+=.25)box([4.80,.026,.025],[0,y,deck+.115],dark);
  for(const side of [-1,1]){
    for(const y of [-1.9,0,1.9])rod([side*2.34,y,deck+.12],[side*2.34,y,deck+1.1],.045,steel);
    for(const z of [deck+.58,deck+1.1])rod([side*2.34,-1.9,z],[side*2.34,2.32,z],.045,steel);
    rod([side*.50,2.42,deck+.15],[side*2.34,2.42,deck+.15],.055,steel);
    rod([side*.50,2.42,deck+1.1],[side*2.34,2.42,deck+1.1],.045,steel);
  }
  // Access ladder terminates at the rear platform opening.
  for(const x of [-.40,.40])rod([x,2.72,.5],[x,2.42,deck+1.1],.055,steel);
  for(let z=.75;z<deck+.15;z+=.32){const y=2.72-.30*(z-.5)/(deck+.6);rod([-.40,y,z],[.40,y,z],.039,steel);}
  box([.65,.48,.94],[1.75,.95,deck+.58],paint);
  for(const z of [deck+.38,deck+.71])box([.68,.04,.045],[1.75,.69,z],steel);
  const kit=vehicleKit(T),rig=new T.Group(),yaw=kit.group(rig,[0,0,0],'tower_yaw');
  const mount=deck+.66;
  kit.cylinder(yaw,.60,.36,[0,0,mount-.18],steel);
  kit.box(yaw,[.66,.70,.75],[0,0,mount+.27],paint);
  const pitch=kit.group(yaw,[0,-.18,mount+.78],'tower_pitch'),recoil=kit.group(pitch,[0,0,0],'tower_recoil');
  const gun=kit.group(recoil,[0,0,-.58],'tower_kord');gun.rotation.z=Math.PI;gun.scale.setScalar(1.45);
  const palette={olive:paint,edge:steel,dark,rubber:dark,steel,glass:dark};
  buildKord(T,gun,palette,kit).muzzle.name='muzzle';
  // Angled plates protect the mount without enclosing it in a featureless box.
  const shield=kit.group(yaw,[0,-.80,mount+.58],'tower_shield');
  for(const side of [-1,1]){
    const plate=kit.box(shield,[1.05,.11,1.04],[side*.69,0,0],paint);plate.rotation.x=-.19;
    const cheek=kit.box(shield,[.12,.92,.77],[side*1.24,.40,-.05],paint);cheek.rotation.z=side*.18;
    for(const x of [side*.28,side*1.10])for(const z of [-.35,.36])kit.cylinder(shield,.033,.13,[x,-.08,z],steel,'Y',6);
  }
  kit.box(shield,[2.42,.13,.19],[0,0,-.56],steel);
  let shieldId;
  part('tower_shield',{material:'metal',detachable:true,strength:270},id=>shieldId=id);
  rig.traverse(node=>{if(node.isMesh){let id=9;for(let p=node;p;p=p.parent)if(p===shield)id=shieldId;node.geometry.setAttribute('damagePart',new T.Float32BufferAttribute(new Float32Array(node.geometry.attributes.position.count).fill(id),1));node.castShadow=node.receiveShadow=true;}});
  batchRigidMeshes(T,rig);
  return rig;
}
