import {batchRigidMeshes,vehicleKit} from './field-vehicles.js';

// Module space uses metres, +Y forward and +Z up. The flange starts at z=0.
export function createFlamerModule(T) {
  const kit=vehicleKit(T),root=new T.Group();
  root.name='field_flamer';
  const paint=new T.MeshStandardMaterial({name:'flamer_olive_enamel',color:'#596047',metalness:.36,roughness:.61});
  const steel=new T.MeshStandardMaterial({name:'flamer_steel',color:'#4c524f',metalness:.70,roughness:.52});
  const dark=new T.MeshStandardMaterial({name:'flamer_dark_steel',color:'#222825',metalness:.46,roughness:.72});
  const band=new T.MeshStandardMaterial({name:'flamer_warning_band',color:'#9c743f',metalness:.24,roughness:.71});
  const pilot=new T.MeshStandardMaterial({name:'flamer_igniter',color:'#523021',emissive:'#ff743d'});

  kit.group(root,[0,0,0],'mount');
  kit.cylinder(root,.45,.08,[0,0,.04],steel,'Z',24);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    kit.cylinder(root,.024,.023,[Math.cos(a)*.394,Math.sin(a)*.394,.081],dark,'Z',6);
  }
  const yaw=kit.group(root,[0,0,.08],'turret_yaw');
  kit.cylinder(yaw,.346,.096,[0,0,.069],dark,'Z',20);
  kit.profile(yaw,[[-.74,.134],[.35,.134],[.42,.19],[.23,.238],[-.68,.238]],.93,paint);
  for(const x of [-.36,.36]){
    kit.profile(yaw,[[-.68,.20],[-.61,.53],[-.20,.55],[.05,.37],[.03,.20]],.11,paint,x);
    const shell=new T.LatheGeometry([
      [0,-.388],[.081,-.381],[.135,-.355],[.151,-.31],[.151,.28],[.137,.336],[.086,.374],[0,.383]
    ].map(([r,y])=>new T.Vector2(r,y)),16);
    kit.mesh(yaw,shell,steel,[x,-.38,.388]);
    kit.cylinder(yaw,.156,.062,[x,-.62,.388],dark,'Y',16);
    kit.cylinder(yaw,.156,.052,[x,-.22,.388],dark,'Y',16);
    kit.cylinder(yaw,.153,.08,[x,-.40,.388],band,'Y',16);
    kit.cylinder(yaw,.057,.10,[x,.034,.388],steel,'Y',10);
    kit.rod(yaw,[x,.08,.388],[x*.59,.17,.284],.034,dark);
    kit.rod(yaw,[x*.59,.17,.284],[x*.34,.12,.297],.034,dark);
  }
  kit.profile(yaw,[[.025,.17],[.27,.18],[.31,.44],[.19,.52],[.06,.50],[-.025,.35]],.34,paint);
  for(const x of [-.19,.19])kit.cylinder(yaw,.085,.055,[x,.181,.342],steel,'X',10);

  const pitch=kit.group(yaw,[0,.181,.342],'equipment_pitch');
  kit.cylinder(pitch,.074,.63,[0,.35,0],dark,'Y',14);
  kit.cylinder(pitch,.094,.14,[0,.113,0],steel,'Y',14);
  const nozzle=new T.LatheGeometry([
    [.046,.58],[.092,.58],[.111,.642],[.111,.793],[.079,.822],[.061,.822],[.054,.781],[.046,.65],[.046,.58]
  ].map(([r,y])=>new T.Vector2(r,y)),16);
  kit.mesh(pitch,nozzle,steel,[0,0,0],'nozzle');
  kit.rod(pitch,[.084,.23,-.042],[.084,.724,-.042],.022,band);
  kit.cylinder(pitch,.027,.09,[.084,.765,-.042],dark,'Y',10);
  kit.cylinder(pitch,.019,.015,[.084,.817,-.042],pilot,'Y',10);
  const muzzle=kit.group(pitch,[0,.826,0],'fx_muzzle');
  batchRigidMeshes(T,root);
  return {root,yaw,pitch,muzzle};
}
