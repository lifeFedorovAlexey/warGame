// Lime survey lines on the soil: true building dimensions, no UI or collision.
// All three plots share one static draw call and follow the terrain surface.
export function createBaseSiteMarkings(T,field,config,addFog){
  const positions=[],colors=[],scale=config.worldScale;
  const material=new T.MeshStandardMaterial({color:'#e3d7b6',roughness:1,vertexColors:true,transparent:true,opacity:.86,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  addFog(material);
  for(const site of config.baseSites??[]){
    const centre=field.gridToWorld(site.grid),angle=(site.rotationDegrees??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    const [width,depth]=config.buildings[site.kind].realSizeMetres;
    const w=(width/2+.30)*scale,d=(depth/2+.30)*scale,stroke=.30*scale,arm=2.6*scale;
    function strip(x,y,sx,sy){
      const cols=Math.max(1,Math.ceil(sx/1.5)),rows=Math.max(1,Math.ceil(sy/1.5));
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const left=x-sx/2+col*sx/cols,bottom=y-sy/2+row*sy/rows;
        for(const [u,v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
          const lx=left+u*sx/cols,ly=bottom+v*sy/rows,px=centre.x+lx*c-ly*s,py=centre.y+lx*s+ly*c;
          const wear=.78+.20*(.5+.5*Math.sin(px*3.1+py*4.7));
          positions.push(px,py,field.heightAt(px,py)+.12);colors.push(wear,wear,wear);
        }
      }
    }
    for(const side of [-1,1]){
      for(const end of [-1,1]){
        strip(end*(w-arm/2),side*d,arm,stroke);
        strip(side*w,end*(d-arm/2),stroke,arm);
      }
      // Broken lines keep the whole empty plot legible without a solid frame.
      for(let x=-w+arm+3*scale;x<w-arm-2*scale;x+=4.5*scale)strip(x,side*d,1.8*scale,stroke*.72);
      for(let y=-d+arm+3*scale;y<d-arm-2*scale;y+=4.5*scale)strip(side*w,y,stroke*.72,1.8*scale);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,material);mesh.name='building_plot_markings';mesh.receiveShadow=true;
  return mesh;
}
