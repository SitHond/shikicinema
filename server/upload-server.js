#!/usr/bin/env node
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const HOST = process.env.UPLOAD_SERVER_HOST || '127.0.0.1';
const PORT = Number(process.env.UPLOAD_SERVER_PORT || 8787);
const DATA_FILE = process.env.UPLOAD_SERVER_DATA || path.resolve(__dirname, '..', 'data', 'shikivideos.json');
const ACCESS_TOKEN = process.env.UPLOAD_SERVER_TOKEN || 'local-upload-token';

function readVideos() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }

        throw error;
    }
}

function writeVideos(videos) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(videos, null, 2) + '\n');
}

function sendJson(res, status, body) {
    const payload = JSON.stringify(body);

    res.writeHead(status, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}

function sendEmpty(res, status = 204) {
    res.writeHead(status, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    });
    res.end();
}

function hasUploadAuth(req) {
    const header = req.headers.authorization || '';

    return header === `Bearer ${ACCESS_TOKEN}`;
}

function createUploadToken() {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
        access_token: ACCESS_TOKEN,
        expires,
    };
}

function normalizeVideo(query, videos) {
    const animeId = Number(query.get('anime_id'));
    const episode = Number(query.get('episode'));
    const url = query.get('url');

    if (!animeId || !episode || !url) {
        const error = new Error('anime_id, episode and url are required');
        error.status = 400;
        throw error;
    }

    return {
        id: videos.reduce((max, video) => Math.max(max, Number(video.id) || 0), 0) + 1,
        url,
        anime_id: animeId,
        episode,
        kind: query.get('kind') || 'озвучка',
        language: query.get('language') || 'ru',
        quality: query.get('quality') || 'unknown',
        author: query.get('author') || 'Local Uploads',
        uploader: query.get('uploader') || 'local-dev',
        watches_count: 0,
    };
}

function paginate(items, query) {
    const offset = Number(query.get('offset') || 0);
    const limitRaw = query.get('limit') || '100';

    if (limitRaw === 'all') {
        return items.slice(offset);
    }

    const limit = Number(limitRaw) || 100;

    return items.slice(offset, offset + limit);
}

function handleShikivideos(req, res, url) {
    const videos = readVideos();

    if (req.method === 'GET') {
        const animeIdMatch = url.pathname.match(/^\/api\/shikivideos\/(\d+)$/);

        if (animeIdMatch) {
            const animeId = Number(animeIdMatch[1]);
            const items = videos.filter((video) => Number(video.anime_id) === animeId);

            sendJson(res, 200, paginate(items, url.searchParams));
            return true;
        }

        if (url.pathname === '/api/shikivideos/search') {
            const uploader = url.searchParams.get('uploader');
            const animeId = url.searchParams.get('anime_id');
            let items = videos;

            if (uploader) {
                items = items.filter((video) => String(video.uploader) === uploader);
            }

            if (animeId) {
                items = items.filter((video) => Number(video.anime_id) === Number(animeId));
            }

            sendJson(res, 200, paginate(items, url.searchParams));
            return true;
        }
    }

    if (req.method === 'POST' && url.pathname === '/api/shikivideos') {
        if (!hasUploadAuth(req)) {
            sendJson(res, 401, { error: 'invalid_token' });
            return true;
        }

        const video = normalizeVideo(url.searchParams, videos);
        videos.push(video);
        writeVideos(videos);
        sendJson(res, 201, video);
        return true;
    }

    return false;
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (req.method === 'OPTIONS') {
        sendEmpty(res);
        return;
    }

    try {
        if (req.method === 'PUT' && url.pathname === '/oauth/token') {
            sendJson(res, 200, createUploadToken());
            return;
        }

        if (handleShikivideos(req, res, url)) {
            return;
        }

        sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
        sendJson(res, error.status || 500, { error: error.message || 'server_error' });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Local ShikiRIP upload server listening on http://${HOST}:${PORT}`);
    console.log(`Data file: ${DATA_FILE}`);
});
