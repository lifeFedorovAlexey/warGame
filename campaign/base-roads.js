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
  // Join the surveyed road along its actual tangent, beyond the base junction.
  // Cover the old alignment throughout the transition to avoid a double apron.
  const network=field.roadNetwork?.paths.find(p=>p.from==='player'||p.to==='player');
  const surveyed=network?(network.from==='player'?network.points:[...network.points].reverse()):[];
  const index=surveyed.findIndex(p=>p.x>=east+190),join=index>=0?surveyed[index]:point(east+200,start.y+48);
  const next=(index>=0?surveyed[index+1]:null)??point(join.x+1,join.y),slope=(next.y-join.y)/Math.max(.01,next.x-join.x),endWidth=join.width??network?.width??24;
  main.push(...curve(main[1],point(east+72,start.y),point(join.x-72,join.y-slope*72),join).slice(1).map((p,i)=>{const t=(i+1)/32;return {...p,width:30+(endWidth-30)*t*t*(3-2*t)};}));
  if(index>=0)for(const p of surveyed.slice(index+1)){main.push({...p,width:p.width??endWidth});if(p.x>=join.x+64)break;}
  else main.push({...point(join.x+64,join.y+slope*64),width:endWidth});
  roads.push({kind:'street',width:30,points:main,markUntilX:join.x+22,replaceRect:[west-42,start.y-120,join.x+40,start.y+170]});
  for(const site of config.baseSites??[]){
    if(site.kind==='factory'||site.approachRoad===false)continue;
    const p=field.gridToWorld(site.grid),direction=site.rotationDegrees===180?-1:1;
    const front=p.y-direction*config.buildings[site.kind].realSizeMetres[1]*config.worldScale/2;
    roads.push({kind:site.kind,width:site.kind==='factory'?25:21,points:[point(p.x,start.y),point(p.x,front-direction*5)]});
  }
  return roads;
}
