import { createFeatureSelector, createSelector } from '@ngrx/store';

import { DEFAULT_SHIKIMORI_DOMAIN } from '@app/core/providers/shikimori-domain/default-shikimori-domain.token';
import { ShikimoriStoreInterface } from '@app/store/shikimori/types/shikimori-store.interface';

export const selectShikimori = createFeatureSelector<ShikimoriStoreInterface>('shikimori');

function toAbsoluteShikimoriUrl(url: string | undefined, domain = DEFAULT_SHIKIMORI_DOMAIN): string | undefined {
    if (!url) {
        return url;
    }

    if (/^https?:\/\//.test(url)) {
        return url;
    }

    return `${domain || DEFAULT_SHIKIMORI_DOMAIN}${url}`;
}

export const selectShikimoriCurrentUser = createSelector(
    selectShikimori,
    (state) => state.currentUser,
);

export const selectIsShikimoriCurrentUserLoading = createSelector(
    selectShikimori,
    (state) => state.isCurrentUserLoading,
);

export const selectShikimoriAnimeSearchLoading = createSelector(
    selectShikimori,
    (state) => state.isAnimeSearchLoading,
);

export const selectShikimoriFoundAnimes = createSelector(
    selectShikimori,
    (state) => state.foundAnimes,
);

export const selectShikimoriCurrentUserId = createSelector(
    selectShikimoriCurrentUser,
    (currentUser) => currentUser?.id,
);

export const selectShikimoriDomain = createSelector(
    selectShikimori,
    (state) => state.shikimoriDomain,
);

export const selectShikimoriCurrentUserAvatar = createSelector(
    selectShikimoriCurrentUser,
    selectShikimoriDomain,
    (currentUser, domain) => toAbsoluteShikimoriUrl(
        currentUser?.image?.x80 || currentUser?.image?.x64 || currentUser?.avatar,
        domain,
    ),
);

export const selectShikimoriCurrentUserAvatarHiRes = createSelector(
    selectShikimoriCurrentUser,
    selectShikimoriDomain,
    (currentUser, domain) => toAbsoluteShikimoriUrl(
        currentUser?.image?.x160 || currentUser?.image?.x148 || currentUser?.avatar,
        domain,
    ),
);

export const selectShikimoriCurrentUserNickname = createSelector(
    selectShikimoriCurrentUser,
    (currentUser) => currentUser?.nickname,
);

export const selectShikimoriCurrentUserProfileLink = createSelector(
    selectShikimoriCurrentUser,
    selectShikimoriDomain,
    (currentUser, domain) => toAbsoluteShikimoriUrl(currentUser?.url, domain),
);

function toAbsoluteShikimoriUrl(url: string | undefined, domain = DEFAULT_SHIKIMORI_DOMAIN): string | undefined {
    if (!url) {
        return url;
    }

    if (/^https?:\/\//.test(url)) {
        return url;
    }

    return `${domain || DEFAULT_SHIKIMORI_DOMAIN}${url}`;
}
