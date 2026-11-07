// A physical order marker, shown only for the selected, operational factory.
export function createRallyFlags(T,scene,field,scale) {
  const root=new T.Group();root.name='factory_rally_flags';scene.add(root);
  const flags=new Map();
  const poleGeometry=new T.CylinderGeometry(.055,.075,3.8,6);
  poleGeometry.rotateX(Math.PI/2);poleGeometry.translate(0,0,1.9);
  const clothGeometry=new T.BufferGeometry();
  clothGeometry.setAttribute('position',new T.Float32BufferAttribute([
    0,0,3.72, 1.9,.10,3.48, 1.55,.16,2.74, 0,0,3.02,
  ],3));
  clothGeometry.setIndex([0,1,2,0,2,3]);clothGeometry.computeVertexNormals();
  const poleMaterial=new T.MeshStandardMaterial({color:'#c5b58e',roughness:.8,metalness:.25});
  const clothMaterial=new T.MeshStandardMaterial({color:'#e5a039',roughness:1,side:T.DoubleSide});
  const height=point=>field.heightAt(point.x,point.y)+.15;
  function update(mission,selected,camera) {
    for(const flag of flags.values())flag.visible=false;
    const live=new Set();
    for(const building of mission.state.buildings) {
      if(building.kind!=='factory'||building.owner!=='rai'||building.hp<=0||!building.completed||!building.rally)continue;
      live.add(building.id);
      if(!selected.has(building.id))continue;
      let flag=flags.get(building.id);
      if(!flag) {
        flag=new T.Group();flag.name='rally_'+building.id;flag.userData.factoryId=building.id;
        const pole=new T.Mesh(poleGeometry,poleMaterial),cloth=new T.Mesh(clothGeometry,clothMaterial);
        pole.name='rally_pole';cloth.name='rally_pennant';flag.add(pole,cloth);flag.scale.setScalar(scale);
        flags.set(building.id,flag);root.add(flag);
      }
      flag.position.set(building.rally.x,building.rally.y,height(building.rally));
      // Keep the cloth readable from any orbit angle without covering it with a UI tile.
      flag.rotation.z=Math.atan2(camera.position.y-flag.position.y,camera.position.x-flag.position.x)+Math.PI/2;
      flag.visible=true;
    }
    for(const [id,flag] of flags)if(!live.has(id)){root.remove(flag);flags.delete(id);}
  }
  return {root,update};
}
