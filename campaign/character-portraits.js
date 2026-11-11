const base = new URL('../assets/campaign/alpha/mission01/portraits/', import.meta.url);
const images = new Map();
let catalog;

export function portraitCatalog() {
  return catalog ??= fetch(new URL('manifest.json', base)).then(response => {
    if (!response.ok) throw new Error('Portrait catalog: ' + response.status);
    return response.json();
  });
}

function imageFor(file) {
  if (!images.has(file)) {
    const image = new Image();
    image.src = new URL(file, base).href;
    images.set(file, image.decode().then(() => image));
  }
  return images.get(file);
}

// Draw an atlas region directly; the supplied artwork stays intact on disk.
export async function setCharacterPortrait(canvas, speaker, state) {
  const request = canvas.portraitRequest = {};
  canvas.hidden = true;
  delete canvas.dataset.speaker;
  delete canvas.dataset.state;
  if (!speaker) return false;
  try {
    if(state?.file){
      const image=await imageFor('/'+state.file);
      if(canvas.portraitRequest!==request)return false;
      canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      canvas.style.aspectRatio=`${canvas.width} / ${canvas.height}`;
      canvas.getContext('2d').drawImage(image,0,0);
      canvas.dataset.speaker=speaker;canvas.hidden=false;return true;
    }
    const character = (await portraitCatalog()).characters[speaker];
    if (!character) return false;
    const selected = character.states[state] ? state : character.sceneStates?.[state] ?? character.defaultState;
    const {crop} = character.states[selected], image = await imageFor(character.file);
    if (canvas.portraitRequest !== request) return false;
    const [x, y, width, height] = crop;
    canvas.width = width; canvas.height = height;
    canvas.style.aspectRatio = `${width} / ${height}`;
    canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);
    canvas.dataset.speaker = speaker;
    canvas.dataset.state = selected;
    canvas.hidden = false;
    return true;
  } catch (error) {
    console.warn('Портрет недоступен:', error.message);
    return false;
  }
}
