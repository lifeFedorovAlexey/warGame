import {selectedOrderRoutes} from './order-route-state.js';

// Ground-aligned order cues: one instanced draw, no route lines or labels.
export function createOrderRoutes(T,scene,field){
 const root=new T.Group();root.name='order_routes';scene.add(root);
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
 const ctx=canvas.getContext('2d');ctx.lineCap='square';ctx.lineJoin='miter';
 for(let tile=0;tile<5;tile++){
  ctx.save();ctx.translate(tile*128,0);
  if(tile===4){
   // One compact dot per actual destination, legible over sand and asphalt.
   ctx.beginPath();ctx.arc(64,64,25,0,Math.PI*2);
   ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='rgba(26,21,14,.7)';ctx.lineWidth=5;ctx.stroke();
   ctx.restore();continue;
  }
  const shape=()=>{
   ctx.beginPath();
   for(let i=0;i<4;i++){
    ctx.save();ctx.translate(64,64);ctx.rotate(i*Math.PI/2);
    if(tile===0){ctx.moveTo(42,0);ctx.arc(0,0,42,0,Math.PI*.33);}
    if(tile===1){ctx.moveTo(47,0);ctx.arc(0,0,47,0,Math.PI*.36);ctx.moveTo(39,0);ctx.lineTo(55,0);}
    if(tile===2){ctx.moveTo(-12,-34);ctx.lineTo(0,-46);ctx.lineTo(12,-34);}
    ctx.restore();
   }
   if(tile===3){ctx.moveTo(35,35);ctx.lineTo(93,93);ctx.moveTo(93,35);ctx.lineTo(35,93);}
  };
  // A narrow undercut separates the strokes from both sand and asphalt.
  ctx.strokeStyle='rgba(26,21,14,.6)';ctx.lineWidth=10;shape();ctx.stroke();
  ctx.strokeStyle='#fff';ctx.lineWidth=6;shape();ctx.stroke();ctx.restore();
 }
 const texture=new T.CanvasTexture(canvas);texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;
 const viewport=new T.Vector2(1,1),right=new T.Vector3(1,0,0),forward=new T.Vector3(0,1,0);
 const quad=new T.PlaneGeometry(1,1),geometry=new T.InstancedBufferGeometry();
 geometry.index=quad.index;geometry.setAttribute('position',quad.attributes.position);geometry.setAttribute('uv',quad.attributes.uv);
 const material=new T.ShaderMaterial({
  uniforms:{viewport:{value:viewport},atlas:{value:texture},groundRight:{value:right},groundForward:{value:forward},clock:{value:0}},
  transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
  vertexShader:`
   attribute vec3 anchor;attribute float pixelSize;attribute float tile;attribute vec4 tone;
   attribute vec2 worldSize;attribute float heading;attribute float spin;attribute float minPixels;
   uniform vec2 viewport;uniform vec3 groundRight;uniform vec3 groundForward;uniform float clock;
   varying vec2 atlasUV;varying vec4 color;
   void main(){
    vec4 centre=projectionMatrix*modelViewMatrix*vec4(anchor,1.0);
    float scale=2.0*centre.w/(viewport.y*projectionMatrix[1][1]);
    float angle=heading+spin*clock*.75;float c=cos(angle),s=sin(angle);
    vec3 right=worldSize.x>0.0?vec3(c,s,0.0):groundRight;
    vec3 forward=worldSize.x>0.0?vec3(-s,c,0.0):groundForward;
    vec2 extent=worldSize.x>0.0?worldSize:vec2(pixelSize*scale);
    extent*=max(1.0,minPixels*scale/max(extent.x,extent.y));
    vec3 p=anchor+right*position.x*extent.x+forward*position.y*extent.y;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    atlasUV=vec2((tile+uv.x)/8.0,uv.y);color=tone;
   }`,
  fragmentShader:`uniform sampler2D atlas;varying vec2 atlasUV;varying vec4 color;
   void main(){vec4 ink=texture2D(atlas,atlasUV);if(ink.a<.02)discard;gl_FragColor=ink*color;}`
 });
 const mesh=new T.Mesh(geometry,material);mesh.name='order_destination_marks';mesh.frustumCulled=false;mesh.renderOrder=9982;mesh.visible=false;root.add(mesh);
 const attributes={anchor:3,pixelSize:1,tile:1,tone:4,worldSize:2,heading:1,spin:1,minPixels:1};let capacity=0,markerCount=0,placementCount=0;
 function write(rows){
  if(rows.length>capacity){
   if(capacity)geometry.dispose();capacity=Math.max(32,2**Math.ceil(Math.log2(rows.length)));
   for(const [name,size] of Object.entries(attributes))geometry.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(capacity*size),size).setUsage(T.DynamicDrawUsage));
  }
  for(const [name,size] of Object.entries(attributes)){
   const a=geometry.attributes[name];if(!a)continue;
   rows.forEach((row,i)=>a.array.set(row[name],i*size));if(rows.length)a.needsUpdate=true;
  }
  markerCount=geometry.instanceCount=rows.length;root.visible=mesh.visible=rows.length>0;
 }
 let lastWorld=null,lastKey='',lastBuild=-Infinity,snapshot=[],rebuilds=0;
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const colors={move:rgb('#eee2bc'),combat:rgb('#f28658'),work:rgb('#e5c580'),blocked:rgb('#e7785d')};
 function update(m,selected,camera,width,heightPx,now){
  viewport.set(width,heightPx);
  material.uniforms.clock.value=now;
  const matrix=camera.matrixWorld.elements;right.set(matrix[0],matrix[1],0).normalize();forward.set(-right.y,right.x,0);
  const key=[...selected].join(',')+'|'+m.state.time+'|'+m.state.commandRevision+'|'+m.state.orderQueueSerial;
  if(m.state===lastWorld&&key===lastKey&&now-lastBuild<.1)return;
  lastWorld=m.state;lastKey=key;lastBuild=now;rebuilds++;
  snapshot=selectedOrderRoutes(m,selected);const marks=new Map(),placements=[];
  for(const route of snapshot){
   placements.push(...route.placements);
   for(const p of route.points){
   if(['move','attack-move'].includes(p.action)&&p.state==='active'&&!p.targetId&&route.placements.length)continue;
   const key=p.action+':'+p.x.toFixed(1)+','+p.y.toFixed(1),previous=marks.get(key);
   // A current destination takes precedence over a queued duplicate.
   if(!previous||previous.state==='queued')marks.set(key,p);
  }}
  const rows=[...marks.values()].map(p=>{
   const queued=p.state==='queued',kind=p.state==='blocked'?'blocked':p.action.startsWith('attack')?'combat':p.action==='move'?'move':'work';
   const diameter=p.action==='attack'&&p.radius?(p.radius+3)*2*128/94:0;
   return {anchor:[p.x,p.y,field.heightAt(p.x,p.y)+.8],pixelSize:[queued?28:38],worldSize:[diameter,diameter],heading:[0],spin:[diameter&&!queued?1:0],minPixels:[diameter?44:0],
    tile:[{move:0,combat:1,work:2,blocked:3}[kind]],tone:[...colors[kind],queued?.55:.95]};
  });
  placementCount=placements.length;
  for(const p of placements)rows.push({anchor:[p.x,p.y,field.heightAt(p.x,p.y)+.8],pixelSize:[24],worldSize:[0,0],
   heading:[0],spin:[0],minPixels:[0],tile:[4],tone:[...colors.move,.95]});
  write(rows);
 }
 return {root,update,get snapshot(){return snapshot;},get statistics(){return {routes:snapshot.length,points:snapshot.reduce((sum,r)=>sum+r.points.length,0),markers:markerCount,placements:placementCount,drawCalls:Number(mesh.visible),rebuilds};}};
}
