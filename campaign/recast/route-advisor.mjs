import {importNavMesh,init,NavMeshQuery} from 'recast-navigation';

const vector=({x,y})=>({x,y:0,z:y});

class RouteAdvisor{
  constructor(worker){
    this.worker=worker;
    this.serial=0;
    this.stats={requested:0,bakes:0,discarded:0,bakeMs:0,maxImportMs:0,attempted:0,accepted:0,partial:0,invalid:0,errors:0};
    worker.onmessage=({data})=>this.receive(data);
    worker.onerror=()=>{
      this.stats.errors++;
      worker.terminate();
      this.worker=null;
      this.active?.finish?.();
      this.latest?.finish?.();
      this.active=null;
    };
  }

  disposeMesh(){
    this.mesh?.query.destroy();
    this.mesh?.navMesh.destroy();
    this.mesh=null;
  }

  dispatch(){
    const job=this.latest;
    if(!this.worker||this.active||!job||job.sent)return;
    const {nav,id}=job;
    if(job.revision!==nav.topologyRevision||job.bounds!==nav.bounds.join(','))return;
    const walkable=nav.walkable.slice();
    const occupied=new Uint8Array(walkable.length);
    const snapshot={size:nav.size,cell:nav.cell,half:nav.field.half,bounds:job.playBounds,walkable,occupied};
    this.worker.postMessage({id,snapshot},[walkable.buffer,occupied.buffer]);
    job.sent=true;
    this.active=job;
    this.stats.requested++;
  }

  receive({id,bytes,bakeMs,error}){
    const job=this.active;
    if(job?.id!==id)return;
    this.active=null;
    if(error){
      this.stats.errors++;
    }else{
      this.stats.bakes++;
      this.stats.bakeMs+=bakeMs;
      const {nav,revision,bounds}=job;
      if(job!==this.latest||revision!==nav.topologyRevision||bounds!==nav.bounds.join(',')){
        this.stats.discarded++;
      }else{
        const started=performance.now();
        let navMesh;
        try{
          ({navMesh}=importNavMesh(bytes));
          this.mesh={job,navMesh,query:new NavMeshQuery(navMesh,{maxNodes:16384})};
        }catch{
          navMesh?.destroy();
          this.stats.errors++;
        }
        this.stats.maxImportMs=Math.max(this.stats.maxImportMs,performance.now()-started);
      }
    }
    job.finish?.();
    this.dispatch();
  }

  async prepareForPlay(nav,playBounds){
    // Bake terrain before the simulation starts. Later structure changes are
    // checked against the live navigator, so they cannot change path choice
    // based on how quickly a worker completes on a particular device.
    this.playTerrain=nav.field.navigation??nav.field;
    this.disposeMesh();
    const job={nav,revision:nav.topologyRevision,bounds:nav.bounds.join(','),playBounds:playBounds.slice(),id:++this.serial,sent:false};
    this.latest=job;
    if(!this.worker)return;
    await new Promise(resolve=>{
      const timeout=setTimeout(()=>{
        if(this.latest===job)this.latest=null;
        this.stats.errors++;
        resolve();
      },10000);
      job.finish=()=>{clearTimeout(timeout);resolve();};
      this.dispatch();
    });
  }

  candidate(context,from,to){
    const nav=context.baseNavigator??context;
    const revision=nav.topologyRevision,bounds=nav.bounds.join(',');
    if(context.topologyRevision!==revision||context.bounds.join(',')!==bounds)return null;
    if(this.playTerrain!==(nav.field.navigation??nav.field))return null;
    if(!this.mesh||!context.allowed(...context.grid(from.x,from.y)))return null;
    this.stats.attempted++;
    const {success,path}=this.mesh.query.computePath(vector(from),vector(to),{
      halfExtents:{x:4,y:2,z:4},maxPathPolys:4096,maxStraightPathPoints:4096,
    });
    if(!success||!path.length)return null;
    const end=path.at(-1);
    if(Math.hypot(end.x-to.x,end.z-to.y)>.1){
      this.stats.partial++;
      return null;
    }
    const route=path.map(({x,z})=>({x,y:z}));
    route[route.length-1]={x:to.x,y:to.y};
    let previous=from;
    for(const point of route){
      if(!context.lineClear(previous,point,false,true)){
        this.stats.invalid++;
        return null;
      }
      previous=point;
    }
    this.stats.accepted++;
    return route;
  }
}

export async function createRouteAdvisor(workerUrl){
  await init();
  const worker=new Worker(workerUrl,{type:'module'});
  return new RouteAdvisor(worker);
}
