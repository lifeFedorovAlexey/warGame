// Small deterministic drive model for the proving track. Speed is measured along the road.
export function createDriveModel(){
 let speed=2.16,previousGrade=0,slipTime=0,wheelTravel=0;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 return {
  reset(){speed=0;previousGrade=0;slipTime=0;wheelTravel=0;},
  step(dt,grade,driving=true){
   if(!driving){speed=0;previousGrade=0;slipTime=0;return {speed:0,distance:0,wheelTravel,slip:0,acceleration:0};}
   // A short, eased loss of grip as the leading axle meets an uphill ramp.
   if(previousGrade<.035&&grade>=.035&&speed>.7)slipTime=.95;
   previousGrade=grade;
   const slip=slipTime>0?.18*Math.sin(Math.PI*(1-slipTime/.95)):0;
   slipTime=Math.max(0,slipTime-dt);
   const acceleration=clamp((2.16-speed)-9.81*.30*Math.sin(grade)-slip*.7,-1.25,.9);
   speed=clamp(speed+acceleration*dt,0,3.5);
   const distance=speed*dt;
   wheelTravel+=distance*(1+slip);
   return {speed,distance,wheelTravel,slip,acceleration};
  }
 };
}
