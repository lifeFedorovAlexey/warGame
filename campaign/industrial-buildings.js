import {generatorLayout} from './generator-layout.js';
import {breakableHall} from './breakable-hall.js';

// Silhouettes and details follow references/buildings/industrial-atlas.png.
export function buildIndustrialStructure(T, kind, size, kit) {
  const [w,d,h]=size;
  const {box,cylinder,rod,mesh}=kit;
  const part=kit.part??((name,profile,build)=>build());
  const material=(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const concrete=material('#b4a690',.03,.93), trim=material('#81796d',.12,.85);
  const stripe=material('#a35c3e',.22,.78), roof=material('#666158',.30,.85);
  const steel=material('#494b43',.68,.60), pipe=material('#9a9584',.68,.59);
  const glass=material('#46565b',.32,.31), dark=material('#262b28',.32,.88);
  const caution=material('#c89b46',.45,.68), porcelain=material('#c6b69b',.11,.47);
  for(const [name,mat] of Object.entries({concrete,trim,stripe,roof,steel,pipe,glass,dark,caution,porcelain}))mat.name=name==='glass'?'building_window':'industrial_'+name;

  function windows(x,y,z,width,panes,height=.48,facing=-1){
    box([width+.13,.09,height+.13],[x,y,z],steel);
    for(let i=0;i<panes;i++)box([width/panes-.047,.046,height],[x-width/2+(i+.5)*width/panes,y+facing*.055,z],glass);
  }
  function sideWindows(x,y,z,depth,panes,side,height=.47){
    box([.09,depth+.12,height+.10],[x,y,z],steel);
    for(let i=0;i<panes;i++)box([.045,depth/panes-.047,height],[x+.052*side,y-depth/2+(i+.5)*depth/panes,z],glass);
  }
  function guard(a,b,z){
    const len=Math.hypot(b[0]-a[0],b[1]-a[1]),posts=Math.max(2,Math.ceil(len/2.3));
    for(const lift of [.24,.48])rod([a[0],a[1],z+lift],[b[0],b[1],z+lift],.034,caution);
    for(let i=0;i<=posts;i++){
      const t=i/posts,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;
      rod([x,y,z],[x,y,z+.49],.042,caution);
    }
  }
  function vent(x,y,z,size){
    return part('vent_'+[x,y,z].join('_'),{material:'equipment',detachable:true},()=>{
    box([size,size*.72,.43],[x,y,z+.22],trim);
    box([size*1.04,size*.78,.10],[x,y,z+.46],steel);
    for(let i=0;i<4;i++)box([size*.79,.035,.05],[x,y-size*.22+i*size*.14,z+.526],dark);
    });
  }
  function stack(x,y,bottom,top,radius){
    return part('stack_'+[x,y].join('_'),{material:'concrete',detachable:true,strength:420},()=>{
    cylinder(radius*1.12,.29,[x,y,bottom+.145],steel);
    const sections=6,len=(top-bottom-.29)/sections;
    for(let i=0;i<sections;i++){
      const z=bottom+.29+i*len,r=radius*(1-i*.035);
      const shell=new T.LatheGeometry([new T.Vector2(r,z),new T.Vector2(r-radius*.035,z+len)],16);
      shell.rotateX(Math.PI/2);
      mesh(shell,i%2===0||i===sections-1?concrete:stripe,[x,y,0]);
    }
    const rim=new T.TorusGeometry(radius*.79,.055,7,16);
    mesh(rim,pipe,[x,y,top-.03]);
    cylinder(radius*.76,.075,[x,y,top-.22],dark);
    });
  }

  if(kind==='factory'){
    const width=w*.63,depth=d*.79,x=-w*.117,front=-depth/2,back=depth/2;
    const wall=h*.59,top=.35+wall;
    breakableHall(T,kit,'factory',[width,depth,wall],[x,0,.35],{concrete,roof,steel,dark});
    for(const [left,right] of [[x-width/2-.05,-2.95],[2.95,x+width/2+.05]])box([right-left,.105,1.19],[(left+right)/2,front-.06,1.7],stripe);
    windows(x,front-.09,top-.81,width*.82,11,.55);
    for(const side of [-1,1]){
      const sx=x+side*(width/2+.055);
      sideWindows(sx,0,top-1.05,depth*.74,11,side,.55);
      box([.11,depth,.64],[sx,0,1.58],stripe);
      for(const y of [front+.12,-depth*.19,depth*.19,back-.14])box([.38,.34,wall+.09],[sx,y,.35+wall/2],trim);
    }
    const doorX=0,doorW=5.9,doorH=3.48;
    for(const side of [-1,1])box([.39,.48,doorH+.22],[doorX+side*(doorW/2+.09),front-.24,.35+doorH/2],steel);
    box([doorW+.65,.52,.40],[doorX,front-.24,.35+doorH+.17],trim);
    for(let j=0;j<9;j++)box([.18,.12,.09],[doorX-doorW*.42+j*.55,front-.37,.39],j%2?dark:caution);
    // Roof monitors have sloped glazing, a ridge and sheet-metal backs.
    const profile=new T.Shape().moveTo(-1.44,0).lineTo(1.40,0).lineTo(.83,.84).lineTo(-.50,.84).closePath();
    const monitorWidth=width*.81, slope=Math.atan2(.84,.94), panePitch=monitorWidth/8;
    const monitor=new T.ExtrudeGeometry(profile,{depth:monitorWidth,bevelEnabled:false});
    monitor.applyMatrix4(new T.Matrix4().makeBasis(new T.Vector3(0,1,0),new T.Vector3(0,0,1),new T.Vector3(1,0,0)));
    for(const y of [-depth*.32,0,depth*.32]){
      const z=top+.18;
      kit.structuralPart('roof_monitor_'+y,{material:'metal',strength:150},()=>{
       mesh(monitor.clone(),steel,[x-monitorWidth/2,y,z]);
       box([monitorWidth+.15,1.43,.12],[x,y+.17,z+.87],roof);
      });
      for(let i=0;i<8;i++){
        const paneX=x-monitorWidth/2+(i+.5)*panePitch;
        box([panePitch-.17,1.08,.08],[paneX,y-1.01,z+.46],glass,[slope,0,0]);
      }
      box([monitorWidth+.12,.08,.095],[x,y-.54,z+.86],caution);
      box([monitorWidth+.12,.12,.12],[x,y-1.44,z+.06],trim);
    }
    monitor.dispose();
    guard([x-width*.44,back-.55],[x+width*.44,back-.55],top+.17);
    const sx=w*.371;
    stack(w*.287,d*.303,.39,h-.08,.69);
    for(const y of [-d*.255,-d*.073,d*.106]){
      kit.structuralPart('tank_'+y,{material:'metal',strength:200},()=>{
      for(const dx of [-.87,.87])for(const dy of [-.87,.87])rod([sx+dx,y+dy,.35],[sx+dx,y+dy,2.13],.11,steel);
      box([2.45,2.47,.17],[sx,y,2.14],steel);
      cylinder(1.04,2.84,[sx,y,3.66],pipe);
      cylinder(1.09,.13,[sx,y,4.99],steel);
      cylinder(.52,.32,[sx,y,5.14],trim);
      cylinder(1.08,.105,[sx,y,3.01],steel);
      for(const side of [-1,1]){
        rod([sx+side*.87,y-.87,.49],[sx+side*.87,y+.87,2.06],.061,steel);
        rod([sx-.87,y+side*.87,.49],[sx+.87,y+side*.87,2.06],.061,steel);
      }
      });
    }
    const wallX=x+width/2, canopyX=wallX+1.22, pipeX=wallX+2.52, pipeZ=2.99;
    box([2.74,3.85,.24],[canopyX,-1.70,3.17],trim);
    for(const y of [-3.41,-.02]){
      box([.29,.29,2.70],[wallX+2.35,y,1.70],concrete);
      box([.39,.39,.20],[wallX+2.35,y,.45],steel);
    }
    for(const y of [front*.78,0,back*.71]){
      box([.24,.24,2.48],[pipeX,y,1.59],steel);
      box([.32,.43,.19],[pipeX,y,2.71],steel);
    }
    const pipeStart=front*.82,pipeEnd=back*.73;
    for(const z of [2.58,2.80])rod([pipeX,pipeStart,z],[pipeX,pipeEnd,z],.07,steel);
    const braceStep=(pipeEnd-pipeStart)/8;
    for(let i=0;i<8;i++){
      const y=pipeStart+i*braceStep;
      rod([pipeX,y,i%2?2.80:2.58],[pipeX,y+braceStep,i%2?2.58:2.80],.054,steel);
    }
    part('external_pipework',{material:'equipment',detachable:true,strength:140},()=>{
      rod([pipeX,pipeStart,pipeZ],[pipeX,pipeEnd,pipeZ],.18,pipe);
      rod([wallX,pipeEnd,pipeZ],[pipeX,pipeEnd,pipeZ],.18,pipe);
      for(const y of [-d*.255,-d*.073,d*.106])rod([pipeX,y,pipeZ],[sx-.96,y,pipeZ],.14,pipe);
    });
    for(const y of [-4.9,-2.6,1.5,4.1])box([.4,.085,.4],[pipeX,y,pipeZ],steel);
    return;
  }

  if(kind==='lab'){
    const wing=w*.352,sideX=w*.291,depth=d*.715,fy=-depth/2+.21,wall=h*.615,top=.35+wall;
    for(const side of [-1,1]){
      const x=side*sideX;
      breakableHall(T,kit,'lab_'+side,[wing,depth,wall],[x,.21,.35],{concrete,roof,steel,dark});
      box([wing+.16,.19,.22],[x,.21+depth/2,top+.23],trim);
      box([.19,depth,.22],[x+side*wing/2,.21,top+.23],trim);
      for(const z of [1.44,2.67,3.83]){
        windows(x,fy-.055,z,wing*.86,5,.55);
        windows(x,fy+depth+.055,z,wing*.86,5,.55,1);
        sideWindows(x+side*(wing/2+.055),.21,z,depth*.82,8,side,.52);
      }
      for(const y of [fy+.16,fy+depth-.16])box([.27,.31,wall],[x+side*wing/2,y,.35+wall/2],trim);
      box([wing*.66,.11,.48],[x,fy-.07,.68],stripe);
      guard([x-wing*.44,fy+.26],[x+wing*.44,fy+.26],top+.22);
      guard([x+side*wing*.43,fy+.27],[x+side*wing*.43,1.5],top+.22);
      vent(x+side*.83,2.60,top+.24,1.25);
      vent(x-side*.82,2.33,top+.24,.86);
    }
    const midH=h*.789,midW=w*.238,midFront=-d*.396,midDepth=d*.79,base=.35+midH;
    breakableHall(T,kit,'lab_centre',[midW,midDepth,midH],[0,midFront+midDepth/2,.35],{concrete:trim,roof,steel,dark});
    box([midW*.68,.13,midH*.65],[0,midFront-.11,.35+midH*.61],stripe);
    for(const side of [-1,1]){
      box([.33,.23,midH-.20],[side*midW*.45,midFront-.06,.35+(midH-.20)/2],concrete);
      box([midW*.30,.20,1.56],[side*midW*.16,midFront-.13,1.13],dark);
    }
    box([midW*1.19,1.48,.25],[0,midFront-.68,2.20],concrete);
    for(const x of [-midW*.49,midW*.49])box([.22,.21,1.84],[x,midFront-1.24,1.27],trim);
    for(let i=0;i<3;i++)box([midW*.91,.20,.12],[0,midFront-1.43+i*.21,.42+i*.08],concrete);
    for(const a of [0,Math.PI/3,Math.PI*2/3]){
      const torus=new T.TorusGeometry(.70,.043,6,18);
      torus.scale(1,.53,1);torus.rotateZ(a);torus.rotateX(Math.PI/2);
      mesh(torus,porcelain,[0,midFront-.21,h*.68]);
    }
    for(const x of [-.58,.28])for(const y of [1.34,2.09])rod([x,y,base+.10],[-.15,1.70,base+.60],.044,steel);
    rod([-.15,1.70,base+.49],[-.15,1.70,h-.07],.044,stripe);
    rod([-.39,1.70,h-.28],[.09,1.70,h-.28],.031,porcelain);
    const dishProfile=[[0,0],[.41,.055],[.72,.16],[.99,.31],[1.15,.45],[1.15,.51],[.98,.36],[.69,.22],[.39,.116],[0,.064]];
    const dish=new T.LatheGeometry(dishProfile.map(([r,z])=>new T.Vector2(r,z)),22);
    dish.rotateX(Math.PI/2);
    // The tilted lower rim needs clearance above the roof, not just its centre.
    const mount=[sideX,.77,top+1.08], tilt=[.93,-.30,.12];
    cylinder(.39,.78,[sideX,.77,top+.61],steel);
    box([.60,.49,.31],[sideX,.77,top+.97],steel);
    part('radar_dish',{material:'equipment',detachable:true,strength:95},()=>mesh(dish,porcelain,mount,tilt));
    const lip=new T.TorusGeometry(1.145,.033,6,22);
    lip.translate(0,0,.487);
    part('radar_dish',{material:'equipment',detachable:true,strength:95},()=>mesh(lip,pipe,mount,tilt));
    const rotation=new T.Euler(...tilt);
    const dishPoint=(x,y,z)=>new T.Vector3(x,y,z).applyEuler(rotation).add(new T.Vector3(...mount)).toArray();
    for(const x of [-.61,.61])rod(dishPoint(x,.62,.27),dishPoint(0,0,.86),.032,steel);
    rod(dishPoint(0,-.13,.31),dishPoint(0,0,.95),.064,steel);
    return;
  }

  const {hall,towers}=generatorLayout(size);
  const {x,y,width,depth,bottom,top}=hall,fy=y-depth/2,by=y+depth/2;
  breakableHall(T,kit,'plant',[width,depth,top-bottom],[x,y,bottom],{concrete,roof,steel,dark});
  for(const side of [-1,1]){
    const sx=x+side*width/2, edgeY=y+side*depth/2;
    box([width+.18,.18,.20],[x,edgeY,top+.16],trim);
    box([.18,depth-.18,.20],[sx,y,top+.16],trim);
    for(const end of [fy,by])box([.26,.30,top-bottom],[sx,end,(top+bottom)/2],trim);
  }
  box([width,.10,.49],[x,fy-.045,1.81],stripe);
  windows(x,fy-.08,2.44,width*.87,6,.45);
  for(const side of [-1,1]){
    const sx=x+side*(width/2+.055);
    sideWindows(sx,y,2.38,depth*.76,5,side,.42);
    box([.10,depth*.89,.28],[sx,y,1.84],stripe);
  }
  for(const dx of [-1.20,.88]){
    for(const y of [-.74,1.84])vent(x+dx,y,top+.16,.82);
    box([.89,.12,1.12],[x+dx,fy-.06,.93],steel);
    box([1.05,.30,.13],[x+dx,fy-.16,1.57],trim);
  }
  // Rear service entrance and louvres stay readable when the camera orbits the plant.
  windows(x,by+.065,2.44,width*.86,6,.45,1);
  box([width,.10,.33],[x,by+.045,1.83],stripe);
  box([1.62,.20,1.41],[x,by+.09,1.11],trim);
  box([1.37,.11,1.22],[x,by+.19,1.10],dark);
  for(const dx of [-.32,.32])box([.58,.055,1.14],[x+dx,by+.25,1.10],steel);
  box([1.69,.35,.13],[x,by+.20,1.83],trim);
  box([1.84,.58,.16],[x,by+.29,bottom+.08],trim);
  for(const dx of [-1.63,1.63]){
    box([.89,.13,.76],[x+dx,by+.074,1.16],dark);
    for(let i=0;i<5;i++)box([.80,.105,.049],[x+dx,by+.16,.88+i*.135],pipe,[.34,0,0]);
  }
  for(const {x:sx,y:sy,lift,outer,rings} of towers){
    kit.structuralPart('cooling_tower_'+sy,{material:'concrete',strength:380},()=>{
    for(const [profile,material] of [[rings.slice(0,outer.length+1),concrete],[rings.slice(outer.length),roof]]){
      const shell=new T.LatheGeometry(profile.map(([radius,z])=>new T.Vector2(radius,z)),24);
      shell.rotateX(Math.PI/2);mesh(shell,material,[sx,sy,0]);
    }
    const band=new T.LatheGeometry([new T.Vector2(1.048,.96+3.30*lift),new T.Vector2(1.109,.96+3.59*lift)],24);
    band.rotateX(Math.PI/2);mesh(band,stripe,[sx,sy,0]);
    cylinder(1.43,.10,[sx,sy,1.01],dark);
    for(let i=0;i<10;i++){
      const a=i*Math.PI/5,b=a+Math.PI/5,at=(r,angle,z)=>[sx+r*Math.cos(angle),sy+r*Math.sin(angle),z];
      const bottom=at(1.52,a,.38),upper=at(1.57,a,.96),next=at(1.57,b,.96);
      rod(bottom,upper,.075,steel);
      rod(bottom,next,.067,steel);
      rod(upper,next,.065,steel);
    }
    });
    part('cooling_pipe_'+sy,{material:'equipment',detachable:true,strength:150},()=>{
      rod([x+width*.47,sy,1.22],[sx-1.45,sy,1.22],.15,stripe);
      rod([sx-1.48,sy,1.18],[sx-1.48,sy,.68],.15,stripe);
    });
    for(const dx of [-1.49,-2.42])box([.19,.38,.38],[sx+dx,sy,1.22],steel);
  }
  const yardY=-d*.390;
  box([4.89,1.43,.09],[x+.01,yardY,.395],trim);
  for(const tx of [x-1.65,x,x+1.65]){
    part('transformer_'+tx,{material:'equipment',detachable:true,strength:200},()=>{
    box([1.34,1.02,.74],[tx,yardY,.79],steel);
    box([1.41,1.12,.13],[tx,yardY,1.19],roof);
    for(let i=0;i<5;i++)box([.11,.12,.64],[tx-.48+i*.24,yardY-.54,.81],pipe);
    for(const dx of [-.42,0,.42]){
      cylinder(.063,.61,[tx+dx,yardY,1.54],stripe);
      for(const z of [1.36,1.50,1.64,1.78])cylinder(.119,.059,[tx+dx,yardY,z],porcelain);
    }
    });
  }
  const mastX=-w*.453,mastY=-d*.30;
  for(const side of [-1,1]){
    rod([mastX+side*.44,mastY,.35],[mastX+side*.07,mastY,4.20],.072,steel);
    rod([mastX,mastY+side*.39,.35],[mastX,mastY+side*.06,4.20],.064,steel);
    rod([mastX+side*.34,mastY,.85],[mastX-side*.22,mastY,2.08],.052,pipe);
    rod([mastX+side*.22,mastY,2.08],[mastX-side*.11,mastY,3.20],.048,pipe);
  }
  rod([mastX-.49,mastY,3.28],[mastX+.50,mastY,3.28],.063,steel);
  rod([mastX-.36,mastY,3.78],[mastX+.36,mastY,3.78],.055,steel);
  for(const dx of [-.34,.34])cylinder(.09,.24,[mastX+dx,mastY,3.91],porcelain);
  rod([mastX,mastY,4.02],[mastX,mastY,4.41],.055,steel);
}
