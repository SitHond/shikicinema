# Environment generation

Run `npm run set-env` before starting or building the app. The generated Angular environment files must contain only public extension settings.

Client-side values:

```env
SHIKIMORI_API_URI=https://shikimori.rip/api
SHIKIMORI_FALLBACK_API_URI=https://shikimori.fi/api
SHIKIMORI_CLIENT_ID=
SHIKIMORI_EPISODE_NOTIFICATION_TOKEN=
SHIKIMORI_REDIRECT_URI=urn:ietf:wg:oauth:2.0:oob
SMARTHARD_API_URI=https://api.sithond.com
SMARTHARD_FALLBACK_API_URI=https://smarthard.net
SMARTHARD_CLIENT_ID=shikirip-cinema
PLATFORM_TARGET=web-extension
```

Secrets such as `KODIK_AUTH_TOKEN`, `SHIKIMORI_CLIENT_SECRET`, and `SMARTHARD_CLIENT_SECRET` belong only on `api.sithond.com`.
