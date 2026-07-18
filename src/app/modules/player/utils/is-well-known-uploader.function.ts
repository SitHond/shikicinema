import { DELETED_UPLOADER } from '@app/shared/types/well-known-uploader-ids';
import { UploaderIdType } from '@app/shared/types/uploader-id.type';
import { WELL_KNOWN_UPLOADERS_MAP } from '@app/shared/config/well-known-uploaders.config';

export function isWellKnownUploader(uploaderId: UploaderIdType = DELETED_UPLOADER) {
    const uploader = WELL_KNOWN_UPLOADERS_MAP[uploaderId];

    return Boolean(uploader);
}
