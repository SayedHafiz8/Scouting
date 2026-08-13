import type { components } from './api.generated';
import type { User } from './user.model';

type _Schema = components['schemas']['PlayerMedia'];

export type MediaType = NonNullable<_Schema['type']>;
export type MediaReviewStatus = NonNullable<_Schema['reviewStatus']>;
export type MediaStatus = 'processing' | 'ready' | 'failed';
export type MediaRejectionReason =
  | 'unclear_footage'
  | 'scout_name_missing'
  | 'match_date_missing'
  | 'teams_not_specified';

export interface PlayerMedia {
  _id: string;
  player: string;
  uploadedBy: User | string;
  type: MediaType;
  status: MediaStatus;
  // Signed on read by the backend. Null while a video is processing/failed.
  url: string | null;
  embedUrl?: string;   // Bunny token-embed iframe (video, when ready)
  thumbnail?: string;  // signed thumbnail (video, when ready)
  download?: string;   // backend download endpoint (video, when ready)
  title?: string;
  description?: string;
  seasonMatch?: string | null;
  // لو الصورة دي اترفعت مع فيديو في نفس العملية — بتشاور على الفيديو ده (صور بس)
  linkedVideo?: string | null;
  reviewStatus?: MediaReviewStatus | null;
  rejectionReason?: MediaRejectionReason[] | null;
  createdAt: string;
  updatedAt: string;
}

// Presigned TUS envelope returned by POST /players/:id/media/video
export interface VideoUploadEnvelope {
  mediaId: string;
  libraryId: string;
  videoId: string;
  tusEndpoint: string;
  expires: number;
  signature: string;
}

export interface VideoCreateResponse {
  document: PlayerMedia;
  upload: VideoUploadEnvelope;
}

// GET /players/:id/media/upload-eligibility — preview of the video-upload gate
// (mediaMatchGate on the backend): freeform (no qualifying match — title/description
// required) or gated (auto-links to a match the uploader attended and reported).
export type UploadGateMode = 'gated' | 'freeform';

export interface UploadEligibilityMatch {
  _id: string;
  homeTeam: { name: string } | string;
  awayTeam: { name: string } | string;
  matchDate: string;
}

export interface UploadEligibility {
  mode: UploadGateMode;
  seasonMatch?: UploadEligibilityMatch | null;
}
