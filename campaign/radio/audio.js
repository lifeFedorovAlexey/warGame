// Both the game and workshop use the realized text, never the template or a
// previously spoken count. User recordings remain the first choice.
let recordedSpeech={};
let loading;
export function installRecordedSpeech(bank){
 recordedSpeech=bank?.schemaVersion===1?bank.clips??{}:{};
}
export async function loadRecordedSpeech(){
 return loading??=fetch(new URL('../../assets/radio/recorded-speech.json',import.meta.url))
  .then(response=>response.ok?response.json():null).then(installRecordedSpeech).catch(()=>installRecordedSpeech(null));
}
export function recordedRadioClip(voice,text){
 const clip=recordedSpeech[voice]?.[text];
 return clip?.text===text&&clip.voice===voice&&clip.file?.startsWith('assets/radio/recordings/')?{...clip,base:'/'}:null;
}
export function recordedVoiceSample(voice){return Object.values(recordedSpeech[voice]??{})[0]??null;}
export function radioClip(phrase,text,settings,voiceId=phrase.voiceId,role=phrase.role){
 const matches=phrase.audio&&(phrase.audio.text===text||!phrase.audio.text&&text===phrase.text);
 if(phrase.source==='recording'&&matches)return {...phrase.audio,base:'/'};
 if(phrase.source==='text'||!text||/[{}]/.test(text))return null;
 const fallback={driver:'voice-1',scout:'voice-3',builder:'voice-4',technician:'voice-5',radio:'voice-6',commander:'voice-6'};
 const voice=/^voice-[1-6]$/.test(voiceId??'')?voiceId:fallback[role]??'voice-1';
 const recorded=recordedRadioClip(voice,text);if(recorded)return recorded;
 if(settings.ttsProvider!=='local-piper')return null;
 const emotion=['urgent','dry','relieved','calm','somber'].includes(phrase.emotion)?phrase.emotion:'calm';
 return {file:'api/radio/speech?'+new URLSearchParams({voice,text,emotion}),base:'/',text,voice,emotion,
  origin:'temporary-synthesis',generator:'local Piper + FFmpeg'};
}
