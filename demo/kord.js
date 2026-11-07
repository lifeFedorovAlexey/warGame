// Shared metric geometry for the arena and the campaign.
export function buildKord(T, upper, {olive, edge, dark, rubber, steel, glass}, {box, cylinder, group}) {
  cylinder(upper, .45, .08, [0,0,.04], olive);
  const yaw = group(upper, [0,0,.08], 'turret_yaw');
  cylinder(yaw, .27, .14, [0,0,.07], steel);
  box(yaw, [.28,.42,.48], [0,0,.38], edge);
  box(yaw, [.30,.50,.35], [.34,-.10,.43], olive);
  box(yaw, [.13,.22,.28], [-.25,-.10,.60], steel);
  for (const x of [-.14,.14]) {
    box(yaw, [.07,.26,.22], [x,.15,.43], steel);
    cylinder(yaw, .075, .085, [x,.15,.4975], dark, 'X');
  }
  box(yaw, [.13,.18,.28], [0,-.10,.68], steel);
  box(yaw, [.22,.26,.12], [0,-.10,.78], olive);
  box(yaw, [.22,.32,.07], [.22,-.10,.27], steel);
  box(yaw, [.13,.22,.11], [.20,-.02,.46], dark);
  const pitch = group(yaw, [0,.15,.4975], 'equipment_pitch');
  const recoil = group(pitch, [0,0,0], 'recoil_1');
  box(recoil, [.15,.52,.14], [0,.14,0], dark);
  cylinder(recoil, .035, .79, [0,.455,0], steel, 'Y');
  cylinder(recoil, .055, .12, [0,.79,0], dark, 'Y');
  cylinder(recoil, .024, .025, [0,.855,0], rubber, 'Y');
  box(yaw, [.24,.24,.20], [0,-.10,.83], olive);
  cylinder(yaw, .07, .03, [0,.04,.83], glass, 'Y');
  const status = new T.MeshStandardMaterial({color:'#8cde8a', emissive:'#68bd6c', emissiveIntensity:1});
  box(yaw, [.055,.025,.025], [.33,-.36,.42], status);
  const muzzle = group(recoil, [0,.8625,0], 'fx_muzzle');
  return {yaw,pitch,recoil,muzzle};
}
