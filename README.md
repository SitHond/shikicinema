# ShikiRIP Cinema

Форк Shikicinema: браузерное расширение, возвращающее возможность смотреть аниме онлайн на сайте [Shikimori](https://shikimori.rip), с поддержкой учета просмотра и возможностью добавления видео.

> Это форк проекта `Smarthard/shikicinema`. Исходная лицензия BSD 2-Clause сохранена в `LICENSE`; отдельная пометка о форке находится в `FORK_NOTICE.md`.

-   [FAQ](https://github.com/SitHond/shikicinema#faq)
    -   [Почему стоит пользоваться именно Shikicinema](https://github.com/SitHond/shikicinema#%D0%BF%D0%BE%D1%87%D0%B5%D0%BC%D1%83-%D1%81%D1%82%D0%BE%D0%B8%D1%82-%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D1%8C%D1%81%D1%8F-%D0%B8%D0%BC%D0%B5%D0%BD%D0%BD%D0%BE-shikicinema)
    -   [Недостатки Shikicinema](https://github.com/SitHond/shikicinema#%D0%BD%D0%B5%D0%B4%D0%BE%D1%81%D1%82%D0%B0%D1%82%D0%BA%D0%B8-shikicinema)
    -   [Куда загружаются видео](https://github.com/SitHond/shikicinema#%D0%BA%D1%83%D0%B4%D0%B0-%D0%B7%D0%B0%D0%B3%D1%80%D1%83%D0%B6%D0%B0%D1%8E%D1%82%D1%81%D1%8F-%D0%B2%D0%B8%D0%B4%D0%B5%D0%BE)
    -   [Какие видео можно загружать](https://github.com/SitHond/shikicinema#%D0%BA%D0%B0%D0%BA%D0%B8%D0%B5-%D0%B2%D0%B8%D0%B4%D0%B5%D0%BE-%D0%BC%D0%BE%D0%B6%D0%BD%D0%BE-%D0%B7%D0%B0%D0%B3%D1%80%D1%83%D0%B6%D0%B0%D1%82%D1%8C)
    -   [Загрузки с рейтингом Rx](https://github.com/SitHond/shikicinema#%D0%B7%D0%B0%D0%B3%D1%80%D1%83%D0%B7%D0%BA%D0%B8-%D1%81-%D1%80%D0%B5%D0%B9%D1%82%D0%B8%D0%BD%D0%B3%D0%BE%D0%BC-rx)
    -   [Какая информация хранится на сервере о пользователях](https://github.com/SitHond/shikicinema#%D0%BA%D0%B0%D0%BA%D0%B0%D1%8F-%D0%B8%D0%BD%D1%84%D0%BE%D1%80%D0%BC%D0%B0%D1%86%D0%B8%D1%8F-%D1%85%D1%80%D0%B0%D0%BD%D0%B8%D1%82%D1%81%D1%8F-%D0%BD%D0%B0-%D1%81%D0%B5%D1%80%D0%B2%D0%B5%D1%80%D0%B5-%D0%BE-%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D1%8F%D1%85)
    -   [API для получения списка видео](https://github.com/SitHond/shikicinema#api-%D0%B4%D0%BB%D1%8F-%D0%BF%D0%BE%D0%BB%D1%83%D1%87%D0%B5%D0%BD%D0%B8%D1%8F-%D1%81%D0%BF%D0%B8%D1%81%D0%BA%D0%B0-%D0%B2%D0%B8%D0%B4%D0%B5%D0%BE)
    -   [Получение OAuth2 доступа](https://github.com/SitHond/shikicinema#%D0%BF%D0%BE%D0%BB%D1%83%D1%87%D0%B5%D0%BD%D0%B8%D0%B5-oauth2-%D0%B4%D0%BE%D1%81%D1%82%D1%83%D0%BF%D0%B0)

-   [Дисклеймер](https://github.com/SitHond/shikicinema#%D0%B4%D0%B8%D1%81%D0%BA%D0%BB%D0%B5%D0%B9%D0%BC%D0%B5%D1%80)

-   [Для правообладателей](https://github.com/SitHond/shikicinema#%D0%B4%D0%BB%D1%8F-%D0%BF%D1%80%D0%B0%D0%B2%D0%BE%D0%BE%D0%B1%D0%BB%D0%B0%D0%B4%D0%B0%D1%82%D0%B5%D0%BB%D0%B5%D0%B9)

-   [Установка](https://github.com/SitHond/shikicinema#%D1%83%D1%81%D1%82%D0%B0%D0%BD%D0%BE%D0%B2%D0%BA%D0%B0)

-   [Privacy Policy](https://github.com/SitHond/shikicinema#privacy-policy)

## FAQ

### Почему стоит пользоваться именно Shikicinema

Shikicinema имеет собственный архив видеозаписей, бережно перенесенный из дампа базы Shikimori. Основной архив хранит огромное количество видео, как для старых, так и для новых, еще выходящих аниме. Основной архив пользователи могут пополнять новыми видео самостоятельно так же, как это было раньше.

Также ShikiRIP Cinema использует базу [Smarthard.net](https://smarthard.net) и [Kodik](https://kodik.biz) как дополнительные источники. База Kodik обновляется самостоятельно и независимо, чем и удобна, например, для просмотра онгоингов.

### Недостатки Shikicinema

У Shikicinema всё еще есть проблемы с интеграцией базы Kodik - в некоторых ситуациях путаются сезоны для аниме. Разработчики Kodik пообещали внести необходимые изменения, чтобы такого не происходило. До тех пор, всё еще лучшим вариантом остаётся основной архив, который страдает от отсутствия стабильного обновления для онгоингов, что могли бы исправить боты, которые раньше использовались для обновления базы Шикимори.

Переписать ботов под ShikiRIP Cinema (а точнее, под сервер архива видео) не должно быть большой проблемой, поэтому, если Вы знаете людей, которые занимались загрузкой видео, можете обратить их внимание на этот проект. Буду очень признателен.

### Куда загружаются видео

На основной сервер проекта: [sithond.com](https://sithond.com).

### Какие видео можно загружать

Те, что относятся к выбранному тайтлу, т.е. содержат видео с озвучкой, субтитрами или оригиналом. Помните, что у всех есть разные ограничения по доступным сайтам. Например, Smotretanime полностью перешел на платную основу, а Myvi, как оказалось, недавно был заблокирован РКН. Лучшим из вариантов до сих пор остаётся Sibnet и Youtube.

### Загрузки с рейтингом Rx

Запретов нет, лишь бы только тайтл имел страницу на Шикимори.

### Какая информация хранится на сервере о пользователях

Прочтите [Privacy Policy](https://github.com/SitHond/shikicinema#privacy-policy).

### API для получения списка видео

[Документация](https://api.sithond.com/). Пользоваться можно свободно.

### Получение OAuth2 доступа

[Документация](https://api.sithond.com/) Здесь указанно как получить доступ.

## Дисклеймер

Может содержать материалы 18+.

## Для правообладателей

ShikiRIP Cinema и сайт sithond.com не располагают физическими (или какими-либо другими) копиями предоставляемых видеоматериалов, а лишь являются агрегаторами ссылок из открытых источников, предназначенных для домашнего ознакомительного просмотра. Если Вы являетесь правообладателем или его официальным представителем и нашли материалы, нарушающие Ваши авторские права - пожалуйста, обратитесь на почтовый ящик fms@shond.ru с приложением заверенных копий документов подтверждающих ваши права.

## Установка

Если вы просто хотите воспользоваться аддоном:
[Chrome Web Store](https://chromewebstore.google.com/detail/lpimjpdjgfjjfpfmgbmdaembghofocdh?utm_source=item-share-cb)

Для тестирования из исходников же понадобятся следующие программы и компоненты:

-   [Node.js & npm](https://nodejs.org/)
-   [Angular CLI](https://www.npmjs.com/package/@angular/cli)
-   Ваш браузер

### Подготовка к запуску

1. Установите зависимости: `npm run install-deps` или `npm install`.
2. Создайте `.env`: скопируйте `.env.example` в `.env` и заполните токены, которые нужны для вашей сборки. Для dev-запуска без авторизации можно оставить OAuth-поля пустыми.
3. Запустите dev-сервер: `npm start`. Он напрямую использует Angular dev server на `http://127.0.0.1:8100/`, потому что `ionic serve` на некоторых системах зависает на проверке connectivity.

Если нужна именно Ionic-обёртка, остался запасной вариант: `npm run start:ionic`.

Полезные команды:

-   `npm run set-env` - сгенерировать `src/environments/environment.ts` и `environment.prod.ts` из `.env`;
-   `npm run build` - development-сборка расширения;
-   `npm run build:prod`, `npm run bundle` или `npm run release` - production-сборка расширения;
-   `npm run watch` - сборка UI в watch-режиме.

Для полностью функциональной сборки используются переменные из `.env.example`: `KODIK_API_URI`, `KODIK_AUTH_TOKEN`, `SHIKIMORI_API_URI`, `SHIKIMORI_FALLBACK_API_URI`, `SHIKIMORI_CLIENT_ID`, `SHIKIMORI_CLIENT_SECRET`, `SHIKIMORI_REDIRECT_URI`, `SHIKIMORI_EPISODE_NOTIFICATION_TOKEN`, `SMARTHARD_API_URI`, `SMARTHARD_FALLBACK_API_URI`, `SMARTHARD_CLIENT_ID`, `SMARTHARD_CLIENT_SECRET`, `SITHOND_API_URI`, `SITHOND_CLIENT_ID`, `SITHOND_CLIENT_SECRET`, `PLATFORM_TARGET`.

Для OAuth-приложения Shikimori в UI настроек укажите Redirect URI: `urn:ietf:wg:oauth:2.0:oob`. Такое же значение должно быть в `.env` в `SHIKIMORI_REDIRECT_URI`.

### Загрузка временного плагина в Chrome

1.  Перейдите на страницу `chrome://extensions`;
2.  Включите режим разработчика;
3.  Нажмите "Загрузить распакованное расширение...";
4.  Выберите директорию `shikirip-cinema`;

Готово, можно проверять работу.

## Privacy Policy

-   ShikiRIP Cinema __НЕ__ собирает информацию о пользователе или его действиях;

-   ShikiRIP Cinema может собирать информацию о функционировании плеера для статистики __ТОЛЬКО С РАЗРЕШЕНИЯ__ пользователя;

-   ShikiRIP Cinema __НЕ__ передаёт информацию о пользователях или его действиях сторонним ресурсам;

-   В ShikiRIP Cinema используются три архива видео: [основной](https://sithond.com), [Smarthard.net](https://smarthard.net) и база [Kodik](https://kodik.biz);
    -   Основной архив (sithond.com) является собственностью разработчика ShikiRIP Cinema;
    -   Smarthard.net является дополнительным архивом стороннего разработчика;
    -   База Kodik является сторонним ресурсом;

-   Для загрузки видео в основной архив используется ID пользователя с сайта Шикимори для предотвращения случаев недобросовестного использования данной возможности;

-   Для удобства пользователя при работе с нескольких устройств используетcя браузерное API storage.sync, позволяющее синхронизироваться с Шикимори без запроса нового токена доступа;

-   На устройстве пользователя хранится информация о просмотрах серий для автоматического учета его предпочтений;

-   Пользовательские запросы к Шикимори или к архивам видео используют шифрование посредством HTTPS-соединения.

### Локальный сервер загрузки

Для разработки можно поднять совместимый локальный сервер архива видео:

```sh
npm run server:upload
```

По умолчанию он слушает `http://127.0.0.1:8787` и хранит записи в `data/shikivideos.json`.
Чтобы запустить фронт и сервер вместе:

```sh
npm run dev:with-upload
```

Для локального сервера в `.env` используйте:

```env
SITHOND_API_URI=http://127.0.0.1:8787
SITHOND_CLIENT_ID=local-dev
SITHOND_CLIENT_SECRET=local-dev
```

Поддерживаемые endpoint'ы: `PUT /oauth/token`, `GET /api/shikivideos/:animeId`, `GET /api/shikivideos/search`, `POST /api/shikivideos`.
