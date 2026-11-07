export async function createDesertSky(T,renderer,scene){
 const day=await new T.TextureLoader().loadAsync('../assets/maps/alpha/materials/desert-sky.jpg');day.colorSpace=T.SRGBColorSpace;day.wrapS=T.RepeatWrapping;day.repeat.y=1.04;day.offset.y=-.04;
 const geometry=new T.SphereGeometry(18000,40,20);geometry.rotateX(Math.PI/2);
 const material=new T.MeshBasicMaterial({map:day,side:T.BackSide,depthWrite:false,fog:false,toneMapped:false});
 material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 float skyLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 float upperSky=smoothstep(.08,.50,vMapUv.y);
 vec3 coolAir=vec3(.006,.048,.066)*(1.+skyLuma*.8);
 vec3 warmCloud=vec3(.70,.55,.34)*max(.001,skyLuma);
 vec3 gradedSky=mix(coolAir,warmCloud,smoothstep(.32,.75,skyLuma));
 diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.83,.83,.77),gradedSky,.92*upperSky);
 `);};material.customProgramCacheKey=()=> 'dust_sky_v5';
 const mesh=new T.Mesh(geometry,material);mesh.name='desert_sky';mesh.renderOrder=-100;mesh.frustumCulled=false;scene.add(mesh);
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const c=canvas.getContext('2d');c.fillStyle='#796044';c.fillRect(0,256,1024,256);c.drawImage(day.image,0,0,1024,256);
 const environment=new T.CanvasTexture(canvas);environment.colorSpace=T.SRGBColorSpace;environment.mapping=T.EquirectangularReflectionMapping;
 const generator=new T.PMREMGenerator(renderer);scene.environment=generator.fromEquirectangular(environment).texture;scene.environmentRotation.set(Math.PI/2,0,0);generator.dispose();environment.dispose();
 let wasNight;
 return {update(camera,night){mesh.position.copy(camera.position);if(night!==wasNight){material.color.set(night?'#233444':'#ffffff');wasNight=night;}},statistics:{type:'generated panoramic desert sky',runtimeSize:[2048,1024]}};
}
