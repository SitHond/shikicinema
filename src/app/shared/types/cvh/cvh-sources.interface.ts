export interface CvhSources {
    hlsUrl: string | null;
    dashUrl: string | null;
    mpegQhdUrl: string | null;
    mpeg2kUrl: string | null;
    mpeg4kUrl: string | null;
    mpegHighUrl: string | null;
    mpegFullHdUrl: string | null;
    mpegMediumUrl: string | null;
    mpegLowUrl: string | null;
    mpegLowestUrl: string | null;
    mpegTinyUrl: string | null;
}

export interface CvhVideoResponse {
    sources: CvhSources;
}
