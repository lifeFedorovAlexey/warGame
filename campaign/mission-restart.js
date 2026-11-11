export const missionStartKey='warGame.alpha.mission-start.m02.v1';
export const beforeRestartKey='warGame.alpha.before-restart.v1';
const mission03StartKey='warGame.alpha.mission-start.m03.v1';
const checkpointKey='warGame.alpha.before-m02.v1';
const read=text=>{try{return JSON.parse(text);}catch{return null;}};
const previousReport=s=>JSON.stringify(s.campaign?.results?.m01?.report??null);

export async function rememberMissionStart(mission,storage){
 if(!mission.state.m02||mission.state.status!=='running')return;
 storage.setItem(mission.state.m03?mission03StartKey:missionStartKey,await mission.saveAsync());
}

export function missionRestartPlan(mission,storage){
 const current=mission.state;
 if(current.m03){
  const text=storage.getItem(mission03StartKey),start=read(text);
  return start?.state?.m03&&start.state.status==='running'
   &&Number.isFinite(current.m03.startedAt)&&start.state.m03.startedAt===current.m03.startedAt
   &&previousReport(start.state)===previousReport(current)
   &&JSON.stringify(start.state.campaign?.results?.m02?.report??null)===JSON.stringify(current.campaign?.results?.m02?.report??null)
   ?{kind:'start',data:text}:null;
 }
 if(!current.m02)return {kind:'fresh'};
 const text=storage.getItem(missionStartKey),start=read(text);
 if(start?.state?.m02&&Number.isFinite(current.m02.startedAt)&&start.state.m02.startedAt===current.m02.startedAt&&start.state.status==='running'
  &&previousReport(start.state)===previousReport(current))return {kind:'start',data:text};
 // Older campaigns already kept the completed first mission before entering
 // the second. Re-enter from that snapshot, preserving its army and research.
 const checkpoint=storage.getItem(checkpointKey),prior=read(checkpoint);
 if(prior?.state&&!prior.state.m02&&prior.state.status==='victory'&&prior.state.time===current.m02.startedAt
  &&previousReport(prior.state)===previousReport(current))return {kind:'checkpoint',data:checkpoint};
 return null;
}
