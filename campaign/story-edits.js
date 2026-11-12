// Only an explicitly applied workshop snapshot reaches the game. Unfinished
// editor drafts stay independent, including after rebuilding the base script.
export function applyStoryEdits(story, audio, edits) {
  if (!edits) return {story,audio};
  const replacements=new Map(edits.scenes.map(scene=>[scene.id,scene]));
  const scenes=story.scenes.map(scene=>replacements.has(scene.id)?{...scene,...replacements.get(scene.id)}:scene);
  for(const scene of edits.scenes)if(!story.scenes.some(base=>base.id===scene.id))scenes.push(scene);
  const lines=new Map(story.dialogue.map(line=>[line.id,line]));
  for(const line of edits.dialogue)lines.set(line.id,line);
  const referenced=new Set(scenes.flatMap(scene=>scene.cues));
  const dialogue=[...lines.values()].filter(line=>referenced.has(line.id));
  for(const id of referenced)if(!lines.has(id))throw new Error('Applied dialogue is missing: '+id);
  const clips={...audio.clips,...edits.clips};
  const spoken=new Set([...referenced,...story.barks.map(line=>line.id)]);
  for(const id of Object.keys(clips))if(!spoken.has(id))delete clips[id];
  return {
    story:{...story,speakers:{...story.speakers,...edits.speakers},scenes,dialogue,appliedDialogue:{draftRevision:edits.draftRevision,throughScene:edits.throughScene}},
    audio:{...audio,clips},
  };
}
