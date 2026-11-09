import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';

// Read-only A/B loader. Reconstruct only the four pre-fix lines in memory;
// leave every other current production file identical between both runs.
if(process.argv.includes('--baseline'))registerHooks({load(url,context,nextLoad){
 const result=nextLoad(url,context);let source=String(result.source??'').replaceAll('\r\n','\n'),changed=false;
 const replace=(before,after)=>{
  if(source.split(before).length!==2)throw Error('Baseline anchor changed: '+before);
  source=source.replace(before,after);changed=true;
 };
 if(url.endsWith('/campaign/vehicle-motion.js')){
  const main='  const mainLimit = direction > 0 ? curveLimit?.(curve) ?? Infinity : Infinity;\n';
  replace(main,'');
  replace('  const targetSpeed =',main+'  const targetSpeed =');
  replace('  const availableSpeed=lastSpeed+clamp(targetSpeed-lastSpeed,-dynamics.braking*dt,dynamics.acceleration*dt);\n  if(Math.min(distance,Math.max(0,availableSpeed*dt))<.001)return null;\n','');
  replace('reverse ? Infinity : trafficLimit);','reverse ? Infinity : Math.min(trafficLimit,mainLimit));');
  replace('clamp(Math.min(targetSpeed,mainLimit) - lastSpeed,','clamp(targetSpeed - lastSpeed,');
  replace('// A stopped requested arc must not suppress a different, independently\n  // checked arc. Only the shared traffic limit applies to every candidate.',
   'if (travel < .001) return null;');
  replace('const pose = travel>=.001&&nextSpeed<=mainLimit+1e-6?', 'const pose = nextSpeed<=mainLimit+1e-6?');
 }
 if(url.endsWith('/campaign/mission.js'))replace('tolerance,trafficLimit:commonTrafficLimit,','tolerance,trafficLimit,');
 if(changed){
  (globalThis.__curveBaselineSources??={})[url]=createHash('sha256').update(source).digest('hex');
  return {...result,source};
 }
 return result;
}});
