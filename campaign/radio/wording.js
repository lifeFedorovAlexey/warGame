import {realize,stableHash} from './conditions.js';

export const speechKey=text=>String(text??'').toLocaleLowerCase('ru').replaceAll('ё','е').replace(/[^\p{L}\p{N}@]+/gu,' ').trim();

export function renderRadioLine(phrase,context,dictionaries,speaker,addressee,{opening=false,seed=''}={}){
 const values={...context,speakerCallSign:speaker.callSign,speakerName:speaker.givenName??speaker.name,
  addresseeCallSign:addressee?.callSign,addresseeName:addressee?.givenName??addressee?.name};
 const femaleCurrent=!phrase.femaleTextBase||phrase.femaleTextBase===phrase.text;
 const spokenTemplate=speaker.gender==='f'&&femaleCurrent?(phrase.femaleText??phrase.text):phrase.text;
 const body=realize(spokenTemplate,values,dictionaries);if(!body)return null;
 // Identity changes must not disguise the same sentence as a new variant.
 const neutral=phrase.text.replace(/\{(?:speaker|addressee)(?:CallSign|Name)\}/g,'@person');
 const repeatText=realize(neutral,context,dictionaries);if(!repeatText)return null;
 const recorded=phrase.source==='recording'&&phrase.audio&&(phrase.audio.text===body||!phrase.audio.text&&body===phrase.text);
 let text=body;
 if(opening&&!recorded&&speaker.callSign&&!/\{speaker(?:CallSign|Name)\}/.test(phrase.text)&&phrase.identify!==false){
  const patterns=dictionaries.radioOpenings??['{speakerCallSign}, на связи. {body}'];
  const pattern=patterns[stableHash(seed+'|'+speaker.crewId)%patterns.length];
  text=realize(pattern,{...values,body},dictionaries);if(!text)return null;
 }
 return {text,bodyText:body,repeatText:speechKey(repeatText),speakerName:speaker.name??null,
  callSign:speaker.callSign??null,addresseeId:addressee?.crewId??null,addresseeCallSign:addressee?.callSign??null};
}
