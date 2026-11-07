// Silhouettes and details follow references/buildings/industrial-atlas.png.
export function buildIndustrialStructure(T, kind, [w,d,h], kit) {
  const {box,cylinder,rod,mesh}=kit;
  const material=(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const concrete=material('#b5a78e',.08,.87), trim=material('#82796a',.15,.77);
  const stripe=material('#955238',.24,.74), roof=material('#55534b',.38,.84);
  const steel=material('#494b43',.68,.60), pipe=material('#9a9584',.68,.59);
  const glass=material('#37474b',.33,.28), dark=material('#262b28',.32,.88);
  const caution=material('#c89b46',.45,.68), porcelain=material('#c6b69b',.11,.47);

  function windows(x,y,z,width,panes,height=.48){
    box([width+.13,.09,height+.13],[x,y,z],steel);
    for(let i=0;i<panes;i++)box([width/panes-.047,.046,height],[x-width/2+(i+.5)*width/panes,y-.055,z],glass);
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
    box([size,size*.72,.43],[x,y,z+.22],trim);
    box([size*1.04,size*.78,.10],[x,y,z+.46],steel);
    for(let i=0;i<4;i++)box([size*.79,.035,.05],[x,y-size*.22+i*size*.14,z+.526],dark);
  }
  function stack(x,y,bottom,top,radius){
    cylinder(radius*1.12,.29,[x,y,bottom+.145],steel);
    const sections=6,len=(top-bottom-.29)/sections;
    for(let i=0;i<sections;i++)cylinder(radius*(1-i*.035),len,[x,y,bottom+.29+(i+.5)*len],i%2?stripe:concrete);
    const rim=new T.TorusGeometry(radius*.825,.055,7,16);
    mesh(rim,pipe,[x,y,top-.03]);
    cylinder(radius*.81,.075,[x,y,top-.065],dark);
  }

  if(kind==='factory'){
    const width=w*.63,depth=d*.79,x=-w*.117,front=-depth/2,back=depth/2;
    const wall=h*.59,top=.35+wall;
    box([width,depth,wall],[x,0,.35+wall/2],concrete);
    box([width+.18,depth+.16,.22],[x,0,top+.07],steel);
    box([width+.10,.105,1.19],[x,front-.06,1.7],stripe);
    windows(x,front-.09,top-.81,width*.82,11,.55);
    for(const side of [-1,1]){
      const sx=x+side*(width/2+.055);
      sideWindows(sx,0,top-1.05,depth*.74,11,side,.55);
      box([.11,depth,.64],[sx,0,1.58],stripe);
      for(const y of [front+.12,-depth*.19,depth*.19,back-.14])box([.38,.34,wall+.09],[sx,y,.35+wall/2],trim);
    }
    const doorX=0,doorW=5.9,doorH=3.48;
    box([doorW,.18,doorH],[doorX,front-.12,.35+doorH/2],dark);
    for(const side of [-1,1])box([.39,.48,doorH+.22],[doorX+side*(doorW/2+.09),front-.24,.35+doorH/2],steel);
    box([doorW+.65,.52,.40],[doorX,front-.24,.35+doorH+.17],trim);
    for(let j=0;j<7;j++)box([doorW-.20,.035,.032],[doorX,front-.225,.64+j*.37],steel);
    for(let j=0;j<9;j++)box([.18,.12,.09],[doorX-doorW*.42+j*.55,front-.37,.39],j%2?dark:caution);
    for(const y of [-depth*.32,0,depth*.32]){
      const z=top+.44;
      box([width*.80,2.56,.16],[x,y,z],steel,[.26,0,0]);
      for(let i=0;i<7;i++)box([width*.105,2.17,.11],[x-width*.345+i*width*.115,y-.02,z+.11],glass,[.26,0,0]);
      for(const side of [-1,1])box([width*.82,.09,.12],[x,y+side*1.19,z+side*.31+.08],caution,[.26,0,0]);
    }
    guard([x-width*.44,back-.55],[x+width*.44,back-.55],top+.17);
    const sx=w*.371;
    stack(w*.287,d*.303,.39,h-.08,.69);
    for(const y of [-d*.255,-d*.073,d*.106]){
      for(const dx of [-.87,.87])for(const dy of [-.87,.87])rod([sx+dx,y+dy,.35],[sx+dx,y+dy,2.13],.11,steel);
      box([2.45,2.47,.17],[sx,y,2.14],steel);
      cylinder(1.04,2.84,[sx,y,3.66],pipe);
      cylinder(1.09,.13,[sx,y,4.99],steel);
      cylinder(.52,.32,[sx,y,5.14],trim);
      cylinder(1.08,.105,[sx,y,3.01],steel);
    }
    const pipeZ=1.76;
    rod([width*.20,back*.73,pipeZ],[sx,back*.73,pipeZ],.18,pipe);
    rod([sx,back*.73,pipeZ],[sx,front*.82,pipeZ],.18,pipe);
    for(const y of [front*.78,0,back*.71]){
      rod([sx-1.09,y,.37],[sx-1.09,y,pipeZ],.10,steel);
      rod([sx+1.09,y,.37],[sx+1.09,y,pipeZ],.10,steel);
      rod([sx-1.2,y,pipeZ-.20],[sx+1.2,y,pipeZ-.20],.095,steel);
    }
    return;
  }

  if(kind==='lab'){
    const wing=w*.352,sideX=w*.291,depth=d*.715,fy=-depth/2+.21,wall=h*.615,top=.35+wall;
    for(const side of [-1,1]){
      const x=side*sideX;
      box([wing,depth,wall],[x,.21,.35+wall/2],concrete);
      box([wing+.16,depth+.16,.22],[x,.21,top+.07],trim);
      box([wing-.20,depth-.19,.06],[x,.21,top+.20],roof);
      for(const z of [1.44,2.67,3.83]){
        windows(x,fy-.055,z,wing*.86,5,.55);
        sideWindows(x+side*(wing/2+.055),.21,z,depth*.82,8,side,.52);
      }
      box([wing*.66,.11,.48],[x,fy-.07,.68],stripe);
      guard([x-wing*.44,fy+.26],[x+wing*.44,fy+.26],top+.22);
      vent(x+side*.50,2.5,top+.24,1.25);
    }
    const midH=h*.781,midW=w*.238,midFront=-d*.374;
    box([midW,d*.755,midH],[0,.05,.35+midH/2],trim);
    box([midW*.70,.13,midH*.70],[0,midFront-.11,.35+midH*.61],stripe);
    box([midW*.71,.20,1.77],[0,midFront-.13,1.23],dark);
    box([midW*1.16,1.61,.22],[0,midFront-.76,2.30],concrete);
    for(const x of [-midW*.49,midW*.49])box([.15,.15,1.92],[x,midFront-1.34,1.31],trim);
    for(const a of [0,Math.PI/3,Math.PI*2/3]){
      const torus=new T.TorusGeometry(.58,.032,6,18);
      torus.scale(1,.53,1);torus.rotateZ(a);torus.rotateX(Math.PI/2);
      mesh(torus,porcelain,[0,midFront-.21,h*.665]);
    }
    const base=.35+midH;
    stack(-.83,1.23,base,h-.09,.085);
    const dishProfile=[[0,0],[.24,.046],[.46,.13],[.65,.25],[.76,.36],[.76,.42],[.62,.30],[.43,.18],[.20,.085],[0,.059]];
    const dish=new T.LatheGeometry(dishProfile.map(([r,z])=>new T.Vector2(r,z)),22);
    dish.rotateX(Math.PI/2);
    cylinder(.29,.42,[sideX,.84,top+.43],steel);
    mesh(dish,porcelain,[sideX,.84,top+.69],[.66,-.29,.18]);
    rod([sideX,.77,top+.69],[sideX+.17,.51,top+1.45],.052,steel);
    return;
  }

  const x=-w*.223,width=w*.46,depth=d*.59,fy=-depth/2+.68,top=h*.671;
  box([width,depth,top-.35],[x,.68,(top+.35)/2],concrete);
  box([width+.15,depth+.15,.17],[x,.68,top+.055],roof);
  box([width,.10,.49],[x,fy-.045,1.27],stripe);
  windows(x,fy-.08,2.44,width*.87,6,.45);
  sideWindows(x-width/2-.055,.68,2.38,depth*.82,5,-1,.42);
  for(const y of [-.47,1.76])vent(x-.64,y,top+.16,.83);
  const sx=w*.289;
  for(const sy of [-d*.245,d*.245]){
    const rings=[[1.54,.82],[1.39,1.08],[1.22,1.57],[1.03,2.42],[.94,3.24],[.99,4.08],[1.09,4.78],[1.03,4.78],[.92,4.08],[.87,3.24],[.96,2.42],[1.16,1.57],[1.31,1.08],[1.46,.82],[1.54,.82]];
    const g=new T.LatheGeometry(rings.map(([r,z])=>new T.Vector2(r,z)),22);
    g.rotateX(Math.PI/2);mesh(g,concrete,[sx,sy,0]);
    const band=new T.LatheGeometry([new T.Vector2(1.021,4.23),new T.Vector2(1.057,4.49)],22);
    band.rotateX(Math.PI/2);mesh(band,stripe,[sx,sy,0]);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,b=a+.26;
      rod([sx+1.49*Math.cos(a),sy+1.49*Math.sin(a),.34],[sx+1.52*Math.cos(b),sy+1.52*Math.sin(b),.89],.061,steel);
    }
    rod([x+width*.47,sy,1.18],[sx-1.43,sy,1.18],.15,stripe);
  }
  for(const tx of [x-1.36,x+.94]){
    box([1.52,1.23,.86],[tx,-d*.392,.78],steel);
    for(let i=0;i<5;i++)box([.11,.10,.71],[tx-.56+i*.28,-d*.392-.64,.81],pipe);
    for(const dx of [-.49,0,.49]){
      cylinder(.065,.62,[tx+dx,-d*.392,1.51],stripe);
      for(const z of [1.33,1.49,1.66])cylinder(.114,.065,[tx+dx,-d*.392,z],porcelain);
    }
  }
}
