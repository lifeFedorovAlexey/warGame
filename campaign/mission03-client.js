import {prepareM03Travel} from './mission03.js';

export function installM03Client(campaign,{travel,notify}){
 let moving=false;
 const timer=setInterval(async()=>{
  const m=campaign.mission,e=m.state.m03;if(!campaign.state.active||!e?.travelTo||moving)return;
  moving=true;
  try{const data=prepareM03Travel(m);await travel(data);}catch(error){moving=false;notify('Перелёт приостановлен: '+error.message);}
 },200);
 return {dispose(){clearInterval(timer);}};
}
