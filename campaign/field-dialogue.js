const base = new URL('../assets/campaign/alpha/mission01/', import.meta.url);
export const openingChapters = ['intro', 'briefing', 'arrival'];

// The same cue IDs and recordings as the screenplay, presented over live gameplay.
export function openingDialogue(story, audio) {
  const lines = new Map(story.dialogue.map(line => [line.id, line]));
  return Object.fromEntries(openingChapters.map(chapter => [chapter,
    story.gameplayCinematics[chapter].flatMap(part => part.cues.map(id => {
      const line = lines.get(id), clip = audio.clips[id];
      if (!line || !clip) throw new Error('Нет реплики вступления: ' + id);
      return {...line, clip, station:story.speakers[line.speaker].name, portrait:part.scene};
    })),
  ]));
}

export async function loadOpeningDialogue() {
  const read = async file => {
    const response = await fetch(new URL(file, base));
    if (!response.ok) throw new Error(file + ' · ' + response.status);
    return response.json();
  };
  const [story, audio] = await Promise.all([read('story.json'), read('audio.json')]);
  return openingDialogue(story, audio);
}
