import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import type { Upload } from 'tus-js-client';
import { environment } from '../../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';
import {
  PlayerMedia,
  MediaReviewStatus,
  MediaRejectionReason,
  VideoCreateResponse,
  VideoUploadEnvelope,
  UploadEligibility,
} from '../../../core/models/player-media.model';
import { QueryBuilderService } from '../../../core/services/query-builder.service';

export interface MediaLimits {
  maxVideoMB: number;
  maxImageMB: number;
}

@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly http = inject(HttpClient);
  private readonly qb = inject(QueryBuilderService);

  private base(playerId: string): string {
    return `${environment.apiUrl}/players/${playerId}/media`;
  }

  // Server-driven upload caps (never hardcode these — they must track
  // BUNNY_MAX_VIDEO_MB on the backend). Cached: one request per app session.
  private mediaLimits$?: Observable<ApiResponse<MediaLimits>>;
  getMediaLimits(): Observable<ApiResponse<MediaLimits>> {
    if (!this.mediaLimits$) {
      this.mediaLimits$ = this.http
        .get<ApiResponse<MediaLimits>>(`${environment.apiUrl}/media-limits`)
        .pipe(shareReplay(1));
    }
    return this.mediaLimits$;
  }

  getAll(playerId: string, params: Record<string, unknown> = {}) {
    return this.http.get<PaginatedResponse<{ documents: PlayerMedia[] }>>(
      this.base(playerId), { params: this.qb.build(params) }
    );
  }

  getOne(playerId: string, mediaId: string) {
    return this.http.get<ApiResponse<{ document: PlayerMedia }>>(`${this.base(playerId)}/${mediaId}`);
  }

  // ── IMAGE upload (multipart, still through the server for sharp compression) ──
  // Standalone image upload is no longer supported — linkedVideo is required by the backend
  // (every image must accompany a video), so it's a required param here too.
  // admin-assign-players-reports-media — assignedObserver is admin-only server-side
  // (attributes the upload to that observer instead of the admin); undefined for
  // every other role, matching the server's lockFieldExceptAdmin.
  upload(playerId: string, file: File, linkedVideo: string, meta: { title?: string; description?: string; assignedObserver?: string } = {}): import('rxjs').Observable<HttpEvent<unknown>> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    if (meta.title) fd.append('title', meta.title);
    if (meta.description) fd.append('description', meta.description);
    fd.append('linkedVideo', linkedVideo);
    if (meta.assignedObserver) fd.append('assignedObserver', meta.assignedObserver);

    const req = new HttpRequest('POST', this.base(playerId), fd, {
      reportProgress: true,
    });
    return this.http.request(req);
  }

  // ── VIDEO: step 1 — mint a Bunny video + get a presigned TUS envelope ──
  // seasonMatch is no longer sent — the backend auto-resolves it from the player's team
  // fixtures (mediaMatchGate); title/description are only required server-side in freeform mode.
  createVideo(playerId: string, meta: { title?: string; description?: string; fileHash: string; assignedObserver?: string }) {
    return this.http.post<ApiResponse<VideoCreateResponse>>(`${this.base(playerId)}/video`, {
      title: meta.title,
      description: meta.description,
      fileHash: meta.fileHash,
      assignedObserver: meta.assignedObserver,
    });
  }

  // Preview the video-upload gate before picking a file — lets the form show whether
  // upload is blocked, freeform (title/description required), or will auto-link to a match.
  // admin-assign-players-reports-media — assignedObserver previews the gate as it
  // would resolve for that observer instead of the admin itself.
  getUploadEligibility(playerId: string, assignedObserver?: string) {
    const params: Record<string, string> = {};
    if (assignedObserver) params['assignedObserver'] = assignedObserver;
    return this.http.get<ApiResponse<UploadEligibility>>(`${this.base(playerId)}/upload-eligibility`, { params });
  }

  // re-issue a fresh envelope for a still-processing video (resume)
  reissueEnvelope(playerId: string, mediaId: string) {
    return this.http.post<ApiResponse<{ upload: VideoUploadEnvelope }>>(
      `${this.base(playerId)}/video/${mediaId}/upload-envelope`, {}
    );
  }

  // ── VIDEO: step 2 — upload the file DIRECTLY to Bunny over TUS (VPS untouched) ──
  // tus-js-client is dynamically imported so it stays out of the initial bundle
  // (only pulled in the first time someone actually uploads a video).
  // Resolves with the upload controller so the caller can abort.
  async uploadVideoToBunny(
    envelope: VideoUploadEnvelope,
    file: File,
    handlers: {
      onProgress?: (loaded: number, total: number) => void;
      onSuccess?: () => void;
      onError?: (err: Error) => void;
    }
  ): Promise<Upload> {
    const tus = await import('tus-js-client');
    const upload = new tus.Upload(file, {
      endpoint: envelope.tusEndpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        AuthorizationSignature: envelope.signature,
        AuthorizationExpire: String(envelope.expires),
        VideoId: envelope.videoId,
        LibraryId: envelope.libraryId,
      },
      metadata: { filetype: file.type, title: file.name },
      onError: (err) => handlers.onError?.(err),
      onProgress: (loaded, total) => handlers.onProgress?.(loaded, total),
      onSuccess: () => handlers.onSuccess?.(),
    });
    upload.start();
    return upload;
  }

  // ── VIDEO download — backend proxies the 720p MP4 with an attachment header ──
  downloadVideo(playerId: string, mediaId: string) {
    return this.http.get(`${this.base(playerId)}/${mediaId}/download`, { responseType: 'blob' });
  }

  delete(playerId: string, mediaId: string) {
    return this.http.delete<void>(`${this.base(playerId)}/${mediaId}`);
  }

  review(playerId: string, mediaId: string, reviewStatus: Extract<MediaReviewStatus, 'approved' | 'rejected'>, rejectionReason?: MediaRejectionReason[]) {
    return this.http.patch<ApiResponse<{ document: PlayerMedia }>>(
      `${this.base(playerId)}/${mediaId}/review`, { reviewStatus, rejectionReason }
    );
  }
}
