import {setButtonIcon} from '../assets/ui/icons.js';
import {createLoadingProgress} from './loading-progress.js';
import {preloadMenuMedia} from './menu-media.js';

// Hotspots follow the painted signs without overlaying a second copy of the art.
const root=document.getElementById('welcome'),stage=root.querySelector('.menu-art');
const settings=document.getElementById('main-menu-settings'),status=document.getElementById('loading-status');
// Read once with the page, so reopening the menu cannot relabel an older game
// session after another checkout has been deployed on the server.
fetch(new URL('../api/build',import.meta.url),{cache:'no-store'}).then(async response=>{
  if(!response.ok)return;
  const build=await response.json(),label=document.getElementById('menu-build');
  if(typeof build.version!=='string'||!Number.isInteger(build.buildNumber))return;
  const suffix=build.dirty?' · локальные правки':build.branch!=='main'?' · предпросмотр':'';
  label.textContent=`v${build.version} · сборка ${build.buildNumber}${suffix}`;
  label.title=`${build.buildId} · ${build.branch}`;
  label.hidden=false;
}).catch(()=>{});
const loading=createLoadingProgress(root);
const music=document.getElementById('menu-music'),soundToggle=document.getElementById('sound-toggle');
const media=preloadMenuMedia(stage.querySelector('img'),music);
music.volume=.28;
let musicStarting=null,menuReady=false,openMenu=null;
function playMusic(){
  if(musicStarting)return musicStarting;
  if(!music.paused)return Promise.resolve();
  musicStarting=music.play().finally(()=>{musicStarting=null;});
  return musicStarting;
}
function syncMusic(){
  let enabled=soundToggle.getAttribute('aria-pressed')!=='false';
  try{enabled=enabled&&localStorage.getItem('warGame.fieldSound')!=='off';}catch{}
  if(root.hidden||document.hidden){music.pause();return;}
  if(openMenu){
    if(!enabled){music.pause();openMenu();return;}
    playMusic().then(()=>{if(!root.hidden&&!document.hidden)openMenu?.();},error=>{
      if(error.name==='NotAllowedError')loading.awaitSound();
      else if(error.name!=='AbortError'){openMenu=null;loading.error('Не удалось запустить музыку меню. Повторите загрузку.');}
    });
    return;
  }
  if(!menuReady||root.classList.contains('is-loading')||!enabled){music.pause();return;}
  playMusic().catch(error=>{if(!['NotAllowedError','AbortError'].includes(error.name))console.warn('Музыка меню недоступна:',error.message);});
}
new MutationObserver(syncMusic).observe(root,{attributes:true,attributeFilter:['hidden','class']});
new MutationObserver(syncMusic).observe(soundToggle,{attributes:true,attributeFilter:['aria-pressed']});
root.addEventListener('click',syncMusic,{capture:true});
document.addEventListener('keydown',syncMusic,{capture:true});
document.addEventListener('visibilitychange',syncMusic);
window.addEventListener('pagehide',()=>music.pause());
window.addEventListener('pageshow',syncMusic);
syncMusic();
const plates=[
  ['begin',176,290,511,157,'3% 0%,100% 39%,99% 100%,0% 70%'],
  ['resume-save',237,421,422,120,'0% 0%,100% 20%,99% 100%,0% 81%'],
  ['menu-settings',239,533,392,105,'0% 0%,100% 17%,99% 97%,0% 88%'],
  ['menu-exit',263,641,354,98,'0% 0%,100% 4%,99% 92%,0% 99%'],
];
for(const [id,x,y,w,h,clip] of plates){
  const button=document.getElementById(id);
  Object.assign(button.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px',clipPath:'polygon('+clip+')'});
}
function resize(){
  const {width:w,height:h}=root.getBoundingClientRect();if(!w||!h)return;
  const scale=Math.max(w/1672,h/941),portrait=w/h<1;
  // On a narrow screen crop scenery, keeping all four painted words in view.
  const x=portrait?Math.max(w-1672*scale,Math.min(0,w/2-458*scale)):(w-1672*scale)/2;
  stage.style.transform=`translate(${x}px,${(h-941*scale)/2}px) scale(${scale})`;
}
new ResizeObserver(resize).observe(root);resize();
const mirrors=[['menu-sound','sound-toggle'],['menu-voice','story-voice-toggle'],['menu-radio','radio-toggle']];
function refresh(){
  for(const [target,source] of mirrors){
    const button=document.getElementById(target),original=document.getElementById(source);
    setButtonIcon(button,original.dataset.icon==='radio-off'?'radio':original.dataset.icon,original.getAttribute('aria-label'));
    button.setAttribute('aria-pressed',original.getAttribute('aria-pressed')??'true');
    button.nextElementSibling.textContent=button.getAttribute('aria-pressed')==='true'?'Вкл.':'Выкл.';
  }
}
function closeSettings(){
  settings.hidden=true;stage.inert=false;root.classList.remove('show-settings');document.getElementById('menu-settings').focus();
}
document.getElementById('menu-settings').onclick=()=>{
  refresh();settings.hidden=false;stage.inert=true;root.classList.add('show-settings');document.getElementById('menu-sound').focus();
};
document.getElementById('menu-settings-close').onclick=closeSettings;
for(const [target,source] of mirrors)document.getElementById(target).onclick=()=>{document.getElementById(source).click();refresh();};
document.getElementById('menu-exit').onclick=()=>location.assign('about:blank');
root.addEventListener('keydown',event=>{
  if(root.classList.contains('is-loading'))return;
  if(event.code==='Escape'&&!settings.hidden){event.preventDefault();closeSettings();return;}
  const scope=settings.hidden?stage:settings,buttons=[...scope.querySelectorAll('button:not(:disabled)')];
  const index=buttons.indexOf(document.activeElement);
  if(event.code==='ArrowDown'||event.code==='ArrowUp'){
    event.preventDefault();buttons[(index+(event.code==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
  }else if(event.code==='Tab'){
    if(event.shiftKey&&index<=0){event.preventDefault();buttons.at(-1)?.focus();}
    else if(!event.shiftKey&&index===buttons.length-1){event.preventDefault();buttons[0]?.focus();}
  }
});

export const mainMenu={
  loading,
  prepareMedia(){return media.ready(fraction=>loading.update('audio',fraction));},
  ready(hasSave){
    // Reveal the art after play() succeeds, not merely after its bytes arrive.
    // A saved mute deliberately opens silently; it is never overridden here.
    openMenu=()=>{
      openMenu=null;menuReady=true;loading.hide();
      document.getElementById('begin').disabled=false;
      document.getElementById('resume-save').disabled=!hasSave;
      document.getElementById('resume-save').title=hasSave?'Продолжить операцию':'Сохранения ещё нет';
      document.getElementById('menu-settings').disabled=false;
      status.hidden=true;refresh();
    };
    syncMusic();
  },
  error(text){loading.error(text);},
};
