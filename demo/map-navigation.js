export function createMapNavigation(T,{terrain,vehicle,camera,controls,state,jump}){
 const route=terrain.route,mini=document.getElementById('minimap'),canvas=document.getElementById('minimap-canvas'),context=canvas.getContext('2d'),marker=document.getElementById('minimap-vehicle');
 const button=document.getElementById('map-camera'),tempo=document.getElementById('tempo'),select=document.getElementById('checkpoint-select'),next=document.getElementById('checkpoint');
 let checkpoint=0;
 const rates=[1,5,20,60];
 route.stops.forEach((s,i)=>{const option=document.createElement('option');option.value=i;option.textContent=(i+1)+'. '+s.name;select.append(option);});
 const image=new Image();image.src='../assets/maps/alpha/minimap.jpg';image.onload=()=>{
  context.drawImage(image,0,0,512,512);context.lineWidth=2.1;context.strokeStyle='#ffd38a';context.beginPath();
  route.points.forEach((p,i)=>{if(i%4&&i!==route.points.length-1)return;const [x,y]=terrain.field.worldToGrid(p.x,p.y),px=x/127*512,py=y/127*512;if(!i)context.moveTo(px,py);else context.lineTo(px,py);});context.closePath();context.stroke();
  route.stops.forEach((s,i)=>{const [x,y]=terrain.field.worldToGrid(s.x,s.y);context.fillStyle='#182522';context.beginPath();context.arc(x/127*512,y/127*512,9,0,Math.PI*2);context.fill();context.fillStyle='#f8e0a6';context.font='bold 12px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(String(i+1),x/127*512,y/127*512);});
 };
 const pinCanvas=document.createElement('canvas');pinCanvas.width=pinCanvas.height=64;const c=pinCanvas.getContext('2d');c.strokeStyle='#fff0b0';c.lineWidth=5;c.beginPath();c.arc(32,32,21,0,Math.PI*2);c.stroke();c.fillStyle='#fff0b0';c.beginPath();c.moveTo(32,6);c.lineTo(22,24);c.lineTo(42,24);c.closePath();c.fill();
 const pin=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(pinCanvas),depthTest:false,transparent:true}));pin.scale.set(76,76,1);pin.renderOrder=5;terrain.root.add(pin);
 function rate(value){state.timeScale=value;tempo.textContent='Проездка: ×'+value;}
 function setCamera(value){
  state.cameraPoseRevision=(state.cameraPoseRevision??0)+1;
  state.cameraMode=value;button.textContent=value==='overview'?'За машиной':'Вся карта';
  if(value==='overview'){
   const fit=Math.max(1,1/camera.aspect);controls.target.set(0,0,25);camera.position.set(0,-5500*fit,4800*fit);
  }else{
   const scale=vehicle.scale.x,offset=new T.Vector3(6,state.followFront?10:-9,state.followFront?3.8:4.7).multiplyScalar(scale).applyQuaternion(vehicle.quaternion);controls.target.copy(vehicle.position).add(new T.Vector3(0,0,1.7*scale));camera.position.copy(vehicle.position).add(offset);rate(1);
  }
  controls.update();
 }
 function mode(value){const active=value==='arena';mini.hidden=!active;for(const element of [button,tempo,select,next])element.disabled=!active;pin.visible=active&&state.cameraMode==='overview';if(active)setCamera(state.cameraMode);}
 button.onclick=()=>setCamera(state.cameraMode==='overview'?'follow':'overview');tempo.onclick=()=>rate(rates[(rates.indexOf(state.timeScale)+1)%rates.length]);
 function go(index){checkpoint=(index+route.stops.length)%route.stops.length;select.value=String(checkpoint);jump(route.stops[checkpoint].distance);}
 next.onclick=()=>go(checkpoint+1);select.onchange=()=>go(Number(select.value));
 mini.onclick=e=>{if(e.target===select||e.target.closest('select'))return;setCamera('overview');};
 document.getElementById('map-route-count').textContent=route.stops.length;
 document.getElementById('route-length').textContent=(route.length/1000).toFixed(2);document.getElementById('map-route-length').textContent=(route.length/1000).toFixed(1)+' км';
 function update(){
  terrain.baseOutline.visible=state.cameraMode==='overview'&&terrain.path.visible;
  const p=vehicle.position,[gx,gy]=terrain.field.worldToGrid(p.x,p.y);marker.style.left=gx/127*100+'%';marker.style.top=gy/127*100+'%';marker.style.transform='translate(-50%,-50%) rotate('+(-state.heading||0)+'rad)';
  pin.visible=state.mode==='arena'&&state.cameraMode==='overview';pin.position.set(p.x,p.y,p.z+30);
  document.getElementById('route-progress').textContent=((state.routeDistance||0)/1000).toFixed(2);
 }
 rate(state.timeScale);
 return {mode,update,setCamera,setRate:rate,go,resize(){if(state.mode==='arena'&&state.cameraMode==='overview')setCamera('overview');}};
}
