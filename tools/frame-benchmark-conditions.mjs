// Test harness only. fixedRenderScale is a boolean lock in world.js; setting
// it does not change an already reduced renderer pixel ratio.
export function lockRenderScale(world,scale=1){
 if(!Number.isFinite(scale)||scale<=0)throw new Error('Invalid benchmark render scale');
 world.fixedRenderScale=true;world.renderer.setPixelRatio(scale);
 if(world.renderer.getPixelRatio()!==scale)throw new Error('Renderer did not accept the fixed scale');
}
export function verifyFrameConditions(frames,warmup,scale=1){
 if(!frames.length)throw new Error('No measured frames');
 if(!warmup.locked||warmup.frames!==warmup.requestedFrames||warmup.simStart!==warmup.simEnd)throw new Error('Warmup must render the same number of paused frames');
 if(warmup.scales.some(value=>value!==scale)||frames.some(frame=>frame.renderScale!==scale))throw new Error('Render scale changed inside warmup or measurement');
 return {scale,frames:frames.length,warmupFrames:warmup.frames,warmupWallMs:warmup.wallMs,allFramesVerified:true};
}
