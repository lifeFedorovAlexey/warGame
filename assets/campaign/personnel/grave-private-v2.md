# Могила рядового — версия 2

`grave-private-v2.png`: один православный восьмиконечный деревянный крест,
компактный округлый холмик рыхлой земли, прозрачный фон. Вариант одобрен
владельцем для рядового. Создан встроенным `image_gen`, затем скопирован в
проект без изменения альфа-канала. Исходный фон холма сохранён.

Финальный запрос редактирования:

> Edit the supplied single memorial sprite. Keep the canonical Russian Orthodox wooden cross EXACTLY as it is: same three crossbars, proportions, weathered wood, front view and sunset light from the left. Change ONLY the earth mound: replace the long elongated rectangular grave footprint with a SMALL COMPACT ROUND LOW DOMED HEAP OF LOOSE BROWN EARTH directly around the cross's foot. Its footprint is circular, appearing as a shallow rounded ellipse in this perspective. No long grave bed extending to the right. No corners, no rectangular outline, no stone slab, no concrete, no coffin, no grass carpet. The mound width is about 1.3 times the MAIN CROSSBAR width, its front-to-back depth modest, its height about 8 percent of the cross height. Soft natural irregular earth perimeter, small soil clods and realistic granular texture. The cross remains large, dominant, and three-dimensional, with a clearly visible narrow sunlit side. Preserve true transparent background and the cross's existing three-bar silhouette. No text, no nameboard, no additional objects. Entire object uncropped with small transparent margins. Do not add a fourth bar.

Форма: [пояснение Orthodox Church in America](https://www.oca.org/questions/liturgicarts/the-russian-orthodox-cross),
три перекладины; нижняя косая. Могила и крест — единый спрайт для одной записи
погибшего. Отдельного декоративного кладбища в фоне нет.

В сцене: различный масштаб переднего/дальнего плана, падающие тени,
приглушённая насыщенность и яркость по глубине, атмосферная прозрачность,
движущаяся дымка, пыль, трава и редкие вороны. Сцена работает до 24 кадров/с;
основной фон и могилы кэшируются. Анимация останавливается при закрытии,
скрытии вкладки и системном запросе reduced motion.

Шрифты Oswald и Literata загружены из [Google Fonts](https://github.com/google/fonts)
с лицензиями SIL OFL в `fonts/`; ссылки и SHA-256 находятся в `fonts/sources.json`.
Имя и сведения показываются рядом с выбранной могилой; мелкие таблички убраны.

На экране памяти играет предоставленный владельцем трек «The Red Banner's Last
Stand»: `assets/music/memorial-red-banner.mp3`. Он плавно заменяет музыку поля,
повторяется по кругу и учитывает общий выключатель звука; при закрытии экрана
затихает и приостанавливается. Тихий записанный ветер остаётся частью сцены.
Флаг с эмблемой меню и отдельный фон описаны в `memorial-flag-v2.md`.
