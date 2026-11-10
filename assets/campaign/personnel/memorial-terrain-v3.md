# Земляной склон мемориала — версия 3

`memorial-hill-earth-v3.png` создан встроенным ImageGen 10 ноября 2026 года как локальная правка `memorial-hill-clean-v2.png`. Изменение запрошено владельцем: могилы на острых скальных выступах выглядели наложенными поверх фона.

Крупные выступающие плиты на склоне заменены широкими земляными участками с мелким щебнем, неглубокими неровными уступами и сухой травой. Камни по нижнему краю сохраняют характер ландшафта. Композиция, контур холма, закат, дальний город и положение древка сохранены. В фон не добавлены кресты и могилы: их количество и вид по-прежнему определяются записями о погибших.

Изображение скопировано в проект без преобразования. Фон подключён в Canvas мемориала и в CSS узкого экрана. Исходная версия сохранена.

Финальный промпт (режим: встроенный ImageGen, edit):

```text
Use case: precise-object-edit.
Asset type: clean background plate for an existing war-game memorial scene.
Input image 1 is the EDIT TARGET, not a loose style reference. Carefully edit ONLY the ground surface of the foreground hillside, especially the lower-right rocky slope. The game places separate upright grave monuments on top of this plate; its current large diagonal slabs make their round earth bases look pasted onto steep rocks.
Replace the jagged projecting rock shelves across the hillside with believable, broad, gently inclined patches of compacted dark brown earth and fine gravel. Shape the surface into very shallow, irregular, softly rounded contour benches following the same overall hill; each broad patch should look physically suitable for standing upright crosses with small round earthen mounds. Keep these earth patches continuous and unobtrusive, not distinct pads and not a regular terrace grid. Use subtle worn depressions, scattered small partly buried stones, sparse dry grass and fine natural soil detail for scale. Large protruding boulders should remain only along the extreme bottom frame edge, outside the usable slope, and must not dominate the burial area. The hill should still feel rugged, sombre and weathered, but with calmer soil-dominant surfaces and soft contact shadows rather than sharp bright rock streaks. Match the existing warm brown soil, charcoal shadows and restrained amber sunset side-light; avoid glossy edges or bright paving.
STRICT INVARIANTS: preserve the exact full original framing, 1672x941 landscape aspect ratio, original skyline/ridge contour and overall silhouette, camera perspective, sun location and size, entire sky and clouds, distant ruined industrial city, valley, dark left text-safe area, flagpole in its EXACT original position/size, and original cinematic painted realism. Do not flatten or move the whole hill. Do not change the sky. The separate animated flag will be added in code, so keep the bare pole and add NO flag cloth.
Keep the ground COMPLETELY EMPTY: no crosses, no graves, no individual grave mounds, no monuments, no headstones, no cemetery objects, no people, no buildings on the hill, no lamps, no fences, no labels, no text, no UI. The game must draw exactly one grave per real casualty. Output only the finished edited full background, not a mockup or comparison.
```
