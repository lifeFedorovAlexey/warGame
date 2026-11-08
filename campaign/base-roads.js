// A former two-lane street and straight access roads, rendered in the terrain.
export function baseApproachRoads(field,config){
  const start=field.gridToWorld(config.startGrid),roads=[];
  const point=(x,y)=>({x,y});
  function curve(a,b,c,d){
    const result=[];
    for(let i=0;i<=32;i++){
      const t=i/32,u=1-t;
      result.push(point(u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y));
    }
    return result;
  }
  const west=start.x-246,east=start.x+128;
  const main=[point(west,start.y),point(east,start.y)];
  // The district is straight; only its far end joins the existing desert road.
  main.push(...curve(main[1],point(east+30,start.y),point(east+35,start.y+28),point(east+68,start.y+31)).slice(1));
  roads.push({kind:'street',width:30,points:main,replaceRect:[west-42,start.y-120,east+40,start.y+170]});
  for(const site of config.baseSites??[]){
    const p=field.gridToWorld(site.grid),direction=site.rotationDegrees===180?-1:1;
    const front=p.y-direction*config.buildings[site.kind].realSizeMetres[1]*config.worldScale/2;
    roads.push({kind:site.kind,width:site.kind==='factory'?25:21,points:[point(p.x,start.y),point(p.x,front-direction*5)]});
  }
  return roads;
}
