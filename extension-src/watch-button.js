'use strict';

import { FETCH_RESOURCE_TIMEOUT, fetch } from './fetch-timeout';
import { getShikimoriLocale } from './get-shikimori-locale';

const PLAYER_URL = chrome.runtime.getURL('/index.html');
const SHIKIRIP_API = `${process.env.SMARTHARD_API_URI}`;
const SHIKIVIDEOS_API = `${SHIKIRIP_API}/api/shikivideos`;

// Все источники видео — зеркала, как в Angular-приложении
const SHIKIRIP_API_URIS = [
    `${process.env.SMARTHARD_API_URI}`,
    'https://smarthard.net',
].filter((uri, i, arr) => arr.indexOf(uri) === i);
const PLAYER_BUTTON = document.createElement('a');
const INFO_DIV = document.createElement('div');

async function addWatchButtonTo(divInfo) {
    const [ animeId ] = `${window.location}`.match(/\d+/);
    const isAnimePage = `${window.location}`.includes('/animes/');

    if (isAnimePage && divInfo) {
        const anime = await _getAnimeInfo(animeId) || { id: animeId, status: 'anons' };

        await appendWatchButtonTo(divInfo, anime);
        embedInlinePlayer(anime.id);
    }
}

function tryAddButton() {
    const divInfo = document.querySelector('div.c-info-right');
    const hasWatchButton = document.querySelector('#watch_button');

    if (divInfo) {
        if (!hasWatchButton) {
            addWatchButtonTo(divInfo);
        }

        return true;
    }

    return false;
}

async function embedInlinePlayer(animeId) {
    if (document.querySelector('#shikicinema-embed')) {
        return;
    }

    const container = document.createElement('div');
    container.id = 'shikicinema-embed';

    const header = document.createElement('div');
    header.className = 'shikicinema-embed__header';
    header.innerHTML = '<span>Смотреть</span><span class="shikicinema-embed__source"></span>';

    const controls = document.createElement('div');
    controls.className = 'shikicinema-embed__controls';
    controls.innerHTML = `
        <div class="shikicinema-embed__nav">
            <button class="shikicinema-embed__btn" id="shikicinema-prev" title="Предыдущая серия">&#9664;</button>
            <select class="shikicinema-embed__select" id="shikicinema-episode"></select>
            <button class="shikicinema-embed__btn" id="shikicinema-next" title="Следующая серия">&#9654;</button>
        </div>
        <select class="shikicinema-embed__select shikicinema-embed__select--author" id="shikicinema-author"></select>
    `;

    const playerWrap = document.createElement('div');
    playerWrap.className = 'shikicinema-embed__player';

    const iframe = document.createElement('iframe');
    iframe.id = 'shikicinema-embed__frame';
    iframe.allowFullscreen = true;
    iframe.setAttribute('allow', 'fullscreen; autoplay');
    iframe.setAttribute('scrolling', 'no');

    playerWrap.appendChild(iframe);
    container.appendChild(header);
    container.appendChild(controls);
    container.appendChild(playerWrap);

    const target = document.querySelector('div.b-db_entry');

    if (target) {
        target.insertAdjacentElement('afterend', container);
    }

    const [shikiResults, kodikVideos, cvhVideos] = await Promise.all([
        Promise.allSettled(
            SHIKIRIP_API_URIS.map((apiUri) =>
                fetch(`${apiUri}/api/shikivideos/${animeId}?limit=all`, {}, FETCH_RESOURCE_TIMEOUT)
                    .then((res) => res.json())
                    .catch(() => []),
            ),
        ).then((results) => {
            const all = results.flatMap((r) => r.status === 'fulfilled' ? r.value || [] : []);
            const map = new Map();

            for (const v of all) {
                const key = [v.url, v.anime_id, v.episode, v.kind, v.language, v.author].join('|');

                if (!map.has(key)) map.set(key, { ...v, urlType: 'iframe' });
            }

            return [...map.values()];
        }),
        _fetchKodikVideos(animeId),
        _fetchCvhVideos(animeId),
    ]);

    const videos = [...shikiResults, ...kodikVideos, ...cvhVideos];

    if (!videos.length) {
        container.remove();
        return;
    }

    const episodes = [...new Set(videos.map((v) => v.episode))].sort((a, b) => a - b);
    let currentEpisode = episodes[0];
    let currentAuthor = null;

    const episodeSelect = document.getElementById('shikicinema-episode');
    const authorSelect = document.getElementById('shikicinema-author');
    const prevBtn = document.getElementById('shikicinema-prev');
    const nextBtn = document.getElementById('shikicinema-next');
    const sourceLabel = container.querySelector('.shikicinema-embed__source');

    episodes.forEach((ep) => {
        const opt = document.createElement('option');
        opt.value = ep;
        opt.textContent = `Серия ${ep}`;
        episodeSelect.appendChild(opt);
    });

    function getAuthorsForEpisode(ep) {
        const map = new Map();
        videos.filter((v) => v.episode === ep).forEach((v) => {
            if (!map.has(v.author)) map.set(v.author, v);
        });
        return map;
    }

    async function loadVideo(video) {
        if (!video?.url) return;

        sourceLabel.textContent = video.author || '';

        if (video.urlType === 'video' && video.vkId) {
            playerWrap.innerHTML = '<div class="shikicinema-embed__loading">Загрузка...</div>';

            const resolvedUrl = await _resolveCvhUrl(video.vkId);

            if (resolvedUrl) {
                const videoEl = document.createElement('video');

                videoEl.id = 'shikicinema-embed__frame';
                videoEl.src = resolvedUrl;
                videoEl.controls = true;
                videoEl.autoplay = false;
                playerWrap.innerHTML = '';
                playerWrap.appendChild(videoEl);
            } else {
                playerWrap.innerHTML = '<div class="shikicinema-embed__loading">Не удалось загрузить видео</div>';
            }
        } else {
            const src = video.url.startsWith('//') ? `https:${video.url}` : video.url;
            let frameEl = document.getElementById('shikicinema-embed__frame');

            if (!frameEl || frameEl.tagName !== 'IFRAME') {
                playerWrap.innerHTML = '';
                frameEl = document.createElement('iframe');
                frameEl.id = 'shikicinema-embed__frame';
                frameEl.allowFullscreen = true;
                frameEl.setAttribute('allow', 'fullscreen; autoplay');
                frameEl.setAttribute('scrolling', 'no');
                playerWrap.appendChild(frameEl);
            }

            frameEl.src = src;
        }
    }

    function updateNavButtons() {
        const idx = episodes.indexOf(currentEpisode);
        prevBtn.disabled = idx <= 0;
        nextBtn.disabled = idx >= episodes.length - 1;
    }

    function updateAuthorSelect(ep) {
        const authors = getAuthorsForEpisode(ep);
        authorSelect.innerHTML = '';
        for (const [author] of authors) {
            const opt = document.createElement('option');
            opt.value = author;
            opt.textContent = author || '—';
            authorSelect.appendChild(opt);
        }

        const hasCurrentAuthor = currentAuthor && authors.has(currentAuthor);
        if (!hasCurrentAuthor) currentAuthor = authors.keys().next().value;
        authorSelect.value = currentAuthor;

        loadVideo(authors.get(currentAuthor));
    }

    episodeSelect.addEventListener('change', (e) => {
        currentEpisode = Number(e.target.value);
        updateAuthorSelect(currentEpisode);
        updateNavButtons();
    });

    authorSelect.addEventListener('change', (e) => {
        currentAuthor = e.target.value;
        const authors = getAuthorsForEpisode(currentEpisode);
        loadVideo(authors.get(currentAuthor));
    });

    prevBtn.addEventListener('click', () => {
        const idx = episodes.indexOf(currentEpisode);
        if (idx > 0) {
            currentEpisode = episodes[idx - 1];
            episodeSelect.value = currentEpisode;
            updateAuthorSelect(currentEpisode);
            updateNavButtons();
        }
    });

    nextBtn.addEventListener('click', () => {
        const idx = episodes.indexOf(currentEpisode);
        if (idx < episodes.length - 1) {
            currentEpisode = episodes[idx + 1];
            episodeSelect.value = currentEpisode;
            updateAuthorSelect(currentEpisode);
            updateNavButtons();
        }
    });

    episodeSelect.value = currentEpisode;
    updateAuthorSelect(currentEpisode);
    updateNavButtons();
}

function watchAnimePages() {
    const watchBtnObserver = new MutationObserver(() => {
        const isSuccess = tryAddButton();

        if (isSuccess) {
            watchBtnObserver.disconnect();
        }
    });

    watchBtnObserver.observe(document, { childList: true, subtree: true });
}

function watchUrlChanges() {
    let lastUrl = null;

    const urlObserver = new MutationObserver(() => {
        const newUrlLocation = window.location.href;

        if (newUrlLocation !== lastUrl) {
            lastUrl = newUrlLocation;
            // Remove old inline player on navigation
            document.querySelector('#shikicinema-embed')?.remove();
            watchAnimePages();
        }
    });

    urlObserver.observe(document, { childList: true, subtree: true });
}

function _fetchKodikVideos(animeId, timeout = FETCH_RESOURCE_TIMEOUT) {
    const query = `shikimori_id=${animeId}&with_episodes=true`;

    return fetch(`${SHIKIRIP_API}/api/kodik/search?${query}`, {}, timeout)
        .then((res) => res.json())
        .then((res) => {
            if (!res?.total) return [];

            const videos = [];

            for (const result of res.results || []) {
                const { seasons, translation, link } = result;
                const author = translation?.title || null;
                const kind = translation?.type === 'voice' ? 'озвучка'
                    : translation?.type === 'subtitles' ? 'субтитры'
                    : 'оригинал';

                if (seasons) {
                    const seasonKey = Object.keys(seasons).filter((s) => Number(s) > 0)[0];
                    const episodes = seasons[seasonKey]?.episodes || {};

                    for (const [ep, url] of Object.entries(episodes)) {
                        videos.push({
                            url: url.startsWith('//') ? `https:${url}` : url,
                            urlType: 'iframe',
                            episode: Number(ep),
                            author,
                            kind,
                        });
                    }
                } else if (link) {
                    videos.push({
                        url: link.startsWith('//') ? `https:${link}` : link,
                        urlType: 'iframe',
                        episode: 1,
                        author,
                        kind,
                    });
                }
            }

            return videos;
        })
        .catch(() => []);
}

function _fetchCvhVideos(animeId, timeout = FETCH_RESOURCE_TIMEOUT) {
    const cvhApi = 'https://plapi.cdnvideohub.com/api/v1/player/sv';

    return fetch(`${cvhApi}/playlist?id=${animeId}&pub=747&aggr=mali`, {}, timeout)
        .then((res) => res.json())
        .then((res) => (res?.items || [])
            .filter((item) => item.season === 1)
            .map((item) => ({
                url: `https://cdnvideohub.com/video/${item.vkId}`,
                urlType: 'video',
                episode: item.episode,
                author: item.voiceStudio || null,
                kind: 'озвучка',
                vkId: item.vkId,
            })),
        )
        .catch(() => []);
}

function _resolveCvhUrl(vkId, timeout = FETCH_RESOURCE_TIMEOUT) {
    const cvhApi = 'https://plapi.cdnvideohub.com/api/v1/player/sv';

    return fetch(`${cvhApi}/video/${vkId}`, {}, timeout)
        .then((res) => res.json())
        .then(({ sources }) => sources.mpegFullHdUrl
            || sources.mpegHighUrl
            || sources.mpeg4kUrl
            || sources.mpegQhdUrl
            || sources.mpeg2kUrl
            || sources.mpegMediumUrl
            || sources.mpegLowUrl
            || sources.mpegLowestUrl
            || sources.mpegTinyUrl
            || sources.hlsUrl
            || sources.dashUrl
            || null,
        )
        .catch(() => null);
}

function _getUploadedEpisodes(animeId, timeout = FETCH_RESOURCE_TIMEOUT) {
  return fetch(`${SHIKIVIDEOS_API}/${animeId}/length`, {}, timeout)
    .then((res) => res.json())
    .then((res) => res?.length)
    .catch(() => 0);
}

function _getKodikEpisodes(anime, timeout = FETCH_RESOURCE_TIMEOUT) {
  const query = `with_episodes=true&shikimori_id=${anime.id}`;

  return fetch(`${SHIKIRIP_API}/api/kodik/search?${query}`, {}, timeout)
    .then((res) => res.json())
    .then((res) => res?.total)
    .catch(() => 0);
}

function _getAnimeInfo(animeId, timeout = FETCH_RESOURCE_TIMEOUT) {
  return fetch(`/api/animes/${animeId}`, {}, timeout)
    .then((res) => res.json())
    .catch(() => ({ id: animeId }));
}

async function _getMaxUploadedEpisode(anime, timeout = FETCH_RESOURCE_TIMEOUT) {
  const mainArchiveMax = await _getUploadedEpisodes(anime.id, timeout);
  const kodikMax = await _getKodikEpisodes(anime, timeout);
  const maxAvailable = Math.max(mainArchiveMax, kodikMax);

  return Math.min(1, +maxAvailable);
}

async function appendWatchButtonTo(element, anime) {
  const lastOrMaxEpisodeAvailable = await _getMaxUploadedEpisode(anime);
  const isEnglishLocale = getShikimoriLocale() === 'en';

  PLAYER_BUTTON.id = 'watch_button';
  PLAYER_BUTTON.classList.add('b-link_button', 'dark', 'watch-online');
  PLAYER_BUTTON.classList.remove('upload-video');
  PLAYER_BUTTON.textContent = isEnglishLocale ? 'Watch online' : 'Смотреть онлайн';
  PLAYER_BUTTON.href = `${PLAYER_URL}#player/${anime.id}`

  INFO_DIV.classList.add('watch-button-div');

  INFO_DIV.appendChild(PLAYER_BUTTON);
  element.appendChild(INFO_DIV);

  if (lastOrMaxEpisodeAvailable === 0 || anime.status === 'anons' && lastOrMaxEpisodeAvailable === 0) {
    PLAYER_BUTTON.textContent = isEnglishLocale ? 'Upload video' : 'Загрузить видео';
    PLAYER_BUTTON.classList.add('upload-video');
    PLAYER_BUTTON.classList.remove('watch-online');
  }
}

tryAddButton();
watchUrlChanges();
