# Грунт для проецируемого холмика

`grave-soil-topdown.png` — отдельная RGBA-текстура земли строго сверху, созданная встроенным ImageGen. Цветовой референс: `memorial-hill-calm-v4.png`. Исходное изображение скопировано в проект без изменения альфа-канала.

Фронтальный фрагмент грунта из PNG памятников не подходит для проецируемой поверхности: в нём уже нарисованы боковая стенка и перспектива. Новая текстура используется на отдельном низком холмике, задаваемом общей камерой и поверхностью грунта в `campaign/memorial-perspective.js`. Край смягчается во время отрисовки. Верхушки и отделка памятников сохраняют свои исходные изображения.

Финальный промпт (встроенный ImageGen):

```text
Use case: stylized-concept. Asset type: transparent top-down diffuse/albedo texture of one circular earth mound for a small 3D game memorial surface.
Input image 1 is ONLY the authoritative soil COLOR AND PAINTING STYLE reference; do not reproduce the whole landscape.
Create one isolated approximately circular patch of freshly turned dark umber/brown earth, viewed EXACTLY vertically from above: orthographic top-down, camera at 90 degrees to a horizontal ground surface. It will be mapped onto a separate 3D low mound, so provide ONLY the top surface texture. NO visible vertical side, NO front face, NO pedestal, NO bevelled border, NO oblique/isometric view, NO cast shadow, NO baked directional shading, NO painted perspective or height illusion. No cross, marker, stones forming a ring, text, plants, debris or other objects.
The center is quiet matte dark brown soil with subtle broad clay clods, very sparse small partly embedded rounded stones, and slight natural material color variation. Keep microtexture calm and non-repeating; no fine noise, sandpaper, curls, stippling or engraved lines. Match the subdued earthy brown of the reference hillside under its sunset, avoiding light gray or pale sand.
Make the outer outline irregular and softly feathered into FULL TRANSPARENCY, with no visible hard cut edge and no solid outer rim. Texture fills a centered circle about 80 percent of the square canvas width, with generous fully transparent margins. Uniform ambient diffuse light. Output a single square RGBA game texture with a genuinely transparent background, no ground plane or backdrop.
```
