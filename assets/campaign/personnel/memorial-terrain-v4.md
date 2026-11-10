# Спокойная фактура грунта — версия 4

Файл `memorial-hill-calm-v4.png` создан встроенным ImageGen в режиме редактирования `memorial-hill-earth-v3.png` 10 ноября 2026 года. Владелец указал на неподвижную зернистость земли. Причина — избыточная частота и контраст мелких повторяющихся деталей в исходном фоне, заметные при уменьшении изображения в игре.

Микрофактура грунта заменена спокойными тональными переходами, со снижением мелкой детализации в средней и дальней части склона. Отдельные камни и пучки травы сохранены преимущественно впереди. Расстановка могил, их размеры, анимация и данные кампании не менялись. Новый PNG скопирован в проект без последующей обработки и подключён в Canvas и CSS узкого экрана; предыдущая версия сохранена.

Финальный промпт (встроенный ImageGen):

```text
Use case: precise-object-edit.
Asset type: existing war-game memorial background plate, texture correction only.
Image 1 is the edit target. Its ground currently has an artificial evenly distributed pattern of tiny sharp stones, curled straw and embossed squiggles. This repetitive high-frequency microtexture creates visible static grain and visual shimmer when the game reduces the image. Carefully REPAINT ONLY THIS GROUND MICROTEXTURE to remove that defect.
Keep the exact same earth hillside forms, subtle contour benches, slope and composition. Render the earth with broad, calm, softly varying masses of dark umber compacted soil, gentle worn patches and restrained matte tonal transitions. Midground and far slope must be quiet, substantially less granular and lower in fine-detail contrast, with natural atmospheric simplification. Keep enough broad shading to show volume. Reserve occasional distinctly larger embedded stones and isolated dry grass clumps for the nearest bottom edge. Soil must look like natural painterly ground, not sandpaper, carpet, embossed leather, woodgrain, pebbled wallpaper, repeated scribbles or noise. NO uniform sprinkling of tiny marks. Do NOT solve this with a global blur: the sky, silhouette, pole and a few near foreground accents remain crisp; only the soil's excessive micro-detail is replaced with a calmer painted surface.
STRICT INVARIANTS: retain exact original 1672x941 framing and aspect ratio, camera perspective, overall hill silhouette and ridge contour, all broad landforms and ground height, original warm sunset color balance and lighting, sun position/size, sky and clouds, distant city/valley and dark left text-safe space, bare flagpole at the exact same coordinates. No new paths, grids, terraces, structures or objects; no flattening the whole hill or turning it into a smooth plastic slab. Preserve a sombre, cinematic painted landscape with controlled detail by distance.
Keep the plate empty: NO graves, crosses, headstones, monuments, individual grave mounds, people, text, UI or flag cloth. Runtime sprites will be composited onto the same ground coordinates. Return the edited full-size background only.
```
