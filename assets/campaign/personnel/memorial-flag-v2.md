# Флаг экрана памяти — версия 2

Создан встроенным `image_gen` по изображению главного меню. Выбранные PNG скопированы в проект без изменения альфа-канала.

- `rai-flag-cloth.png`: отдельное красное полотнище с черепом в шестерне, как на `assets/menu/desert-main-menu.png`. Крепление справа, свободные рваные концы слева; эмблема не отражена.
- `memorial-hill-clean-v2.png`: фон холма с прежним древком, но без ткани. Исходный `memorial-hill.png` сохранён.
- Крепление неподвижно, ткань анимируется отдельной сеткой WebGL и компонуется в Canvas сцены. У общих рёбер нет швов сглаживания. Небо и древко не подвергаются деформации. Цвет ткани приглушается при загрузке текстуры под освещение сцены.

Финальный запрос фона:

> Precise local edit of this game background. Remove ONLY the hanging FLAG FABRIC, its torn streamers, and its dangling loose fabric threads from the upper-right sky. Reconstruct the sunset sky and clouds naturally behind the removed fabric. KEEP the tall straight FLAGPOLE completely intact in the exact same position. Keep the entire landscape, hillside, sky, sun, rocks, framing, every other object, colors, lighting, image dimensions and composition unchanged. This is a clean background plate for later animated cloth, so there must be NO remaining cloth or flag ghost anywhere beside the pole. No new objects, no crosses, no text. Preserve the original 16:9 composition exactly.

Финальный запрос полотнища (изображение 1 — отдельная ткань; изображение 2 — главное меню):

> Edit image 1, the isolated transparent flag cloth. Image 2 is the authoritative reference for the flag design. Replace the faded star on image 1 with the EXACT faction emblem from image 2's main menu banner: an off-white simplified skull inside a dark circular center, surrounded by the off-white cogwheel/gear with blocky teeth. Match that skull-and-gear silhouette and proportions closely; no star, no added text. Change the cloth from olive-brown to the same distressed dark rust-red / oxblood-red fabric used on the reference menu flag, subdued by sunset lighting. Preserve image 1's right-hand vertical attached edge, two eyelets, left-facing free torn tails, overall silhouette, woven texture, weathering and fully transparent background. Keep the ENTIRE flag visible. No pole, no menu elements, no lettering, no additional objects, no background. Low amber sunlight and dark natural folds. The final flag must unmistakably be the same faction flag as the menu image.

Проверки: `node tools/check-personnel-browser.mjs --art` и `node tools/check-memorial-scene-browser.mjs`. Вторая сравнивает кадры с движущейся тканью: пиксели за её пределами и на древке остаются идентичными. Реальные снимки широкого и узкого экранов и видео анимации находятся в `campaign/previews/personnel/`. Видео — запись игрового Canvas, к которой для просмотра добавлен предоставленный владельцем трек с той же громкостью, что в игре.

