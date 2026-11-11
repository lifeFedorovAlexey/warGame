// Both the game and workshop use the realized text, never the template or a
// previously spoken count. User recordings remain the first choice.
export function radioClip(phrase,text,settings,voiceId=phrase.voiceId,role=phrase.role){
 const matches=phrase.audio&&(phrase.audio.text===text||!phrase.audio.text&&text===phrase.text);
 if(phrase.source==='recording'&&matches)return {...phrase.audio,base:'/'};
 if(phrase.source==='text'||settings.ttsProvider!=='local-piper'||!text||/[{}]/.test(text))return null;
 const fallback={driver:'voice-1',scout:'voice-3',builder:'voice-4',technician:'voice-5',radio:'voice-6',commander:'voice-6'};
 const voice=/^voice-[1-6]$/.test(voiceId??'')?voiceId:fallback[role]??'voice-1';
 const emotion=['urgent','dry','relieved','calm','somber'].includes(phrase.emotion)?phrase.emotion:'calm';
 return {file:'api/radio/speech?'+new URLSearchParams({voice,text,emotion}),base:'/',text,voice,emotion,
  origin:'temporary-synthesis',generator:'local Piper + FFmpeg'};
}
