// Download the complete menu track alongside world preparation. A local blob
// lets the menu open with playable audio, without another network wait on click.
export function preloadMenuMedia(image,music){
 let fraction=0,notify=()=>{};
 const progress=value=>{fraction=value;notify(value);};
 async function loadMusic(){
  const response=await fetch(new URL(music.dataset.src,document.baseURI));
  if(!response.ok)throw new Error('Музыка меню: HTTP '+response.status);
  const total=Number(response.headers.get('Content-Length')),chunks=[];
  if(response.body){
   const reader=response.body.getReader();let loaded=0;
   for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;if(total>0)progress(Math.min(.95,loaded/total*.95));}
  }else chunks.push(await response.arrayBuffer());
  await new Promise((resolve,reject)=>{
   const cleanup=()=>{music.removeEventListener('canplaythrough',ready);music.removeEventListener('error',failed);};
   const ready=()=>{cleanup();resolve();};
   const failed=()=>{cleanup();reject(new Error('Не удалось подготовить музыку меню'));};
   music.addEventListener('canplaythrough',ready);music.addEventListener('error',failed);
   music.src=URL.createObjectURL(new Blob(chunks,{type:'audio/mpeg'}));music.load();
  });
 }
 // Retain early failures until the main loading flow reaches the media stage.
 const prepared=Promise.all([image.decode(),loadMusic()]).then(()=>{progress(1);return null;},error=>error);
 return {
  async ready(onProgress){notify=onProgress;notify(fraction);const error=await prepared;if(error)throw error;},
 };
}
