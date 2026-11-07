# Иконки интерфейса

Основа — три листа пользователя от 7 ноября 2026 года. Подготовлены встроенным `image_gen`: фон и внешние рамки удалены, порядок 4 × 4 сохранён. Атласы: `vehicles.png`, `weapons.png`, `buildings.png`. Прозрачность хранится в PNG; исходные файлы генерации не изменялись.

Дополнение — ещё четыре листа по 20 значков: `modules-v2.png`, `buildings-v2.png`, `vehicles-v2.png`, `actions-v2.png`. Новые варианты используются для совпадающих действий, прежние уникальные значки остаются доступны. Все 80 новых значков подключены к каталогу; в игре отображаются только существующие действия.

Прозрачные поля генерации неодинаковы. `atlas-regions.js` содержит точные границы каждого предмета; CSS отображает их без соседних фрагментов, по центру и с сохранением пропорций. Измерения можно обновить через `node tools/check-ui-icons.mjs --measure-atlases`; PNG при этом не изменяются.

Служебные значки в `controls.svg` нарисованы в SVG в той же песочной, оливковой и оранжевой палитре. `icons.js` задаёт семантические имена и создаёт изображения и доступные подписи. `icons.css` оформляет кнопки без видимых названий, рамок и подложек. Меню и панели также не имеют обводок; панели игрового HUD прозрачны. Выделение отмечается янтарным маркером, клавиатурный фокус — свечением и коротким подчёркиванием. При наведении иконки сохраняют положение в центре кнопки.

Для новой кнопки используйте `setButtonIcon(button, icon, label, detail)`; для статической разметки — `data-icon` и `aria-label`. Название, стоимость и время отображаются в `title`. Не записывайте `textContent` в кнопку после инициализации. Численность групп и полосы здоровья остаются индикаторами.

По отдельной просьбе владельца выбранные иконки техники отмечаются тонкой полупрозрачной обводкой без заливки. Выбранные и невыбранные машины одного типа стоят рядом отдельными группами: 7 выбранных из 10 — это две иконки с численностью 7 и 3. Пустая строка «Нет выделения / Выберите машину» убрана.

На карте двойной ЛКМ по своей машине выделяет все живые машины того же типа в текущем экране; Shift добавляет их к выделению. Камера при этом остаётся на месте. Атака назначена на физическую клавишу F, включая русскую раскладку. Проверка: `node tools/check-map-selection.mjs`.

Счётчики производства занимают отдельное место справа от иконки и не перекрывают рисунок. ЛКМ добавляет заказ, ПКМ снимает последний заказ этого проекта и возвращает неиспользованную энергию. Отмена доступна и при нулевой энергии. Один клик по НИИ или производству открывает управление, двойной переносит камеру; конструктор расположен сразу после НИИ. Проверки: `node tools/check-production-cancel.mjs`, `node tools/check-production-ui.mjs`, `node tools/check-roster-ui.mjs`.

Проверка: `node tools/check-ui-icons.mjs`. Скриншоты — `campaign/previews/icons/`, отчёт — `campaign/reports/ui-icons.json`. Строительство и приказы дополнительно проверяются `node tools/check-campaign.cjs`.

Компоновка кампании — `campaign/hud-layout.css`: свободные группы управления у краёв полноэкранной карты. У нижней группы нет заливки или зарезервированной полосы; пустые промежутки пропускают нажатия на карту. Второстепенные действия и полный список задач открываются в меню. Размеры основных кнопок — 40–48 px, служебных — 28–36 px. Правила оформления закреплены в корневом `AGENTS.md`; запрет рамок включает сплошные подложки. Проверка компоновки: `node tools/check-ui-icons.mjs --layout-review`.

## Запрос подготовки атласов

Одинаковый запрос применён к каждому исходному листу, с `transparent_background: true`:

> Edit target: supplied 4 by 4 military strategy UI icon atlas. Background-extraction only: remove ALL black/dark square backgrounds AND all rounded square border frames. Preserve the EXACT sixteen illustrated icon subjects, arrangement, silhouettes, details and colors from the source. Output an RGBA TRANSPARENT background, 4 equal columns and 4 equal rows. Each subject centered in its cell with 10 percent transparent padding. Keep the original flat stencil sand-beige / olive drab / steel grey / amber orange visual style. No text, no borders, no tile outlines, no shadows behind icons, no rearrangement, no added icons. These are production game UI sprites. The black internal negative spaces should also be transparent wherever appropriate. Keep all sixteen icons fully inside their individual cells without crossing boundaries.

Четыре дополнительных листа подготовлены тем же встроенным инструментом с `transparent_background: true`:

> Edit target: supplied military strategy UI sprite sheet of TWENTY icons, FOUR columns and FIVE rows. Background extraction only. Remove every dark navy/black tile background and ALL grey rounded rectangle tile borders. Preserve ALL TWENTY original illustrated subjects exactly, their silhouettes, details, sand-beige / olive-green / vivid amber-orange colors, and original row-major order. Preserve internal dark negative spaces as transparent. Output an RGBA transparent production sprite atlas in a portrait 4:5 aspect ratio with FOUR equal columns and FIVE equal rows of SQUARE cells. Center each original subject in its own square cell, with at least 10 percent transparent padding all around; preserve the subject aspect ratio, never stretch the drawings. Keep the twenty subjects recognizable and identical to the source, no omissions, no duplicated cells, no reordering. No text, tile frames, borders, tile backgrounds, backdrop, drop shadows or new decoration. Transparent outside the icons including between cells.
