import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MediaService } from '../services/media.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { PlayerMedia } from '../../../core/models/player-media.model';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { RejectReasonDialogComponent } from '../../../shared/components/reject-reason-dialog/reject-reason-dialog.component';
import { MediaUploadComponent } from '../media-upload/media-upload.component';
import type { MediaRejectionReason } from '../../../core/models/player-media.model';

@Component({
    selector: 'app-media-gallery',
    imports: [TranslatePipe, EmptyStateComponent, ConfirmDialogComponent, RejectReasonDialogComponent, MediaUploadComponent],
    template: `
    <div class="space-y-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <p class="px-1 text-xs font-medium" style="color:var(--text-secondary)">{{ 'MEDIA.ALL' | translate }}</p>
        @if (auth.isCoach() || auth.isObserver()) {
          <button class="btn btn-primary btn-sm" (click)="showUpload.set(true)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
            </svg>
            {{ 'MEDIA.UPLOAD_BTN' | translate }}
          </button>
        }
      </div>

      <!-- Upload panel -->
      @if (showUpload()) {
        <app-media-upload
          [playerId]="playerId"
          (uploadComplete)="onUploadComplete()"
          (cancelled)="showUpload.set(false)"
        />
      }

      <!-- Gallery -->
      @if (loading()) {
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="aspect-square rounded-xl animate-pulse" style="background:var(--border-color)"></div>
          }
        </div>
      } @else if (filteredMedia().length === 0) {
        <app-empty-state
          [title]="'MEDIA.EMPTY' | translate"
          [message]="'MEDIA.EMPTY_ALL' | translate"
          [actionLabel]="(auth.isCoach() || auth.isObserver()) ? ('MEDIA.UPLOAD_MEDIA' | translate) : null"
          (actionClicked)="showUpload.set(true)"
          icon="media"
        />
      } @else {
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          @for (item of filteredMedia(); track item._id) {
            <div class="relative group rounded-xl overflow-hidden cursor-pointer"
                 [class]="item.type === 'video' ? 'aspect-video' : 'aspect-square'"
                 (click)="openModal(item)">

              @if (item.type === 'image') {
                <img [src]="item.url" [alt]="item.title || 'Player image'"
                     class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
              } @else {
                <div class="w-full h-full flex items-center justify-center relative" style="background:var(--bg-secondary)">
                  @if (item.status === 'ready') {
                    @if (item.thumbnail) {
                      <img [src]="item.thumbnail" class="w-full h-full object-cover" alt="video thumbnail" />
                    }
                    <!-- Playback is admin-only (bandwidth control); non-admins get a plain video badge, not a play affordance -->
                    <div class="absolute inset-0 flex items-center justify-center">
                      <div class="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                        @if (auth.isAdmin()) {
                          <svg class="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        } @else {
                          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                            <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                          </svg>
                        }
                      </div>
                    </div>
                  } @else if (item.status === 'failed') {
                    <div class="flex flex-col items-center gap-1.5 text-center px-2">
                      <svg class="w-6 h-6" style="color:#f43f5e" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <span class="text-[10px] font-medium" style="color:#f43f5e">{{ 'MEDIA.VIDEO_FAILED' | translate }}</span>
                    </div>
                  } @else {
                    <div class="flex flex-col items-center gap-2 text-center px-2">
                      <svg class="w-6 h-6 animate-spin" style="color:#8b5cf6" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      <span class="text-[10px] font-medium" style="color:var(--text-muted)">{{ 'MEDIA.VIDEO_PROCESSING' | translate }}</span>
                    </div>
                  }
                </div>
              }

              @if (item.reviewStatus) {
                <span class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold" [class]="reviewBadgeClass(item.reviewStatus)">
                  {{ 'MEDIA.REVIEW.' + item.reviewStatus.toUpperCase() | translate }}
                </span>
              }

              @if (item.type === 'video' && (linkedImagesByVideo().get(item._id)?.length ?? 0) > 0) {
                <span class="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 bg-black/60 text-white">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  {{ linkedImagesByVideo().get(item._id)?.length }}
                </span>
              }

              <!-- Admin review actions — always visible (not hover-gated), this is a primary workflow action -->
              @if (auth.isAdmin() && item.reviewStatus === 'pending') {
                <div class="absolute bottom-2 left-2 right-2 flex gap-1.5 z-10" (click)="$event.stopPropagation()">
                  <button type="button" class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-colors"
                          style="background:rgba(34,197,94,0.92)"
                          (click)="review(item, 'approved')">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {{ 'MEDIA.REVIEW.APPROVE' | translate }}
                  </button>
                  <button type="button" class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-colors"
                          style="background:rgba(244,63,94,0.92)"
                          (click)="rejectTarget.set(item)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    {{ 'MEDIA.REVIEW.REJECT' | translate }}
                  </button>
                </div>
              }

              <!-- Hover overlay -->
              <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end p-2">
                <div class="opacity-0 group-hover:opacity-100 transition-opacity flex-1">
                  @if (item.title) {
                    <p class="text-white text-xs font-medium truncate">{{ item.title }}</p>
                  }
                </div>
                <div class="flex items-center gap-1">
                  <!-- Download and delete are admin-only — coaches/observers can only view -->
                  @if (auth.isAdmin() && item.type === 'video' && item.status === 'ready') {
                    <button class="opacity-0 group-hover:opacity-100 transition-opacity btn btn-icon btn-sm bg-black/50 text-white backdrop-blur-sm"
                            [disabled]="downloading()" [attr.aria-label]="'MEDIA.DOWNLOAD' | translate"
                            (click)="$event.stopPropagation(); download(item)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    </button>
                  }
                  @if (auth.isAdmin()) {
                    <button class="opacity-0 group-hover:opacity-100 transition-opacity btn btn-icon btn-sm bg-black/50 text-white backdrop-blur-sm"
                            (click)="$event.stopPropagation(); deleteTarget.set(item)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                      </svg>
                    </button>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>

    <!-- Video/image modal -->
    @if (modalItem()) {
      <div class="overlay-backdrop" (click)="modalItem.set(null)">
        <div class="fixed inset-0 flex items-center justify-center p-4 z-50">
          <div class="card max-w-3xl w-full max-h-[90vh] overflow-hidden" (click)="$event.stopPropagation()"
               style="animation: slideUp 0.2s ease">
            <div class="flex items-start justify-between px-4 py-3 border-b gap-3" style="border-color:var(--border-color)">
              <div class="min-w-0">
                <p class="font-medium text-sm truncate" style="color:var(--text-primary)">{{ modalItem()!.title || (modalItem()!.type === 'video' ? 'Video' : 'Image') }}</p>
                @if (modalItem()!.description) {
                  <p class="text-xs mt-0.5" style="color:var(--text-secondary)">{{ modalItem()!.description }}</p>
                }
              </div>
              <div class="flex items-center gap-1 shrink-0">
                @if (auth.isAdmin() && modalItem()!.type === 'video' && modalItem()!.status === 'ready') {
                  <button class="btn btn-ghost btn-sm" [disabled]="downloading()" (click)="download(modalItem()!)">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    {{ (downloading() ? 'COMMON.LOADING' : 'MEDIA.DOWNLOAD') | translate }}
                  </button>
                }
                <button class="btn btn-ghost btn-icon btn-sm" (click)="modalItem.set(null)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="overflow-auto" style="max-height: calc(90vh - 60px)">
              @if (modalItem()!.type === 'image') {
                <img [src]="modalItem()!.url" class="w-full" />
              } @else if (auth.isAdmin() && modalItem()!.embedUrl) {
                <div style="position:relative;padding-top:56.25%">
                  <iframe [src]="safeEmbed(modalItem()!.embedUrl!)" loading="lazy"
                          style="border:0;position:absolute;top:0;left:0;width:100%;height:100%"
                          allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;fullscreen"
                          allowfullscreen></iframe>
                </div>
              }

              <!-- Photos uploaded alongside this video -->
              @if (modalItem()!.type === 'video' && (linkedImagesByVideo().get(modalItem()!._id)?.length ?? 0) > 0) {
                <div class="px-4 py-3 border-t" style="border-color:var(--border-color)">
                  <p class="text-xs font-medium mb-2" style="color:var(--text-secondary)">{{ 'MEDIA.LINKED_IMAGES' | translate }}</p>
                  <div class="flex gap-2">
                    @for (img of linkedImagesByVideo().get(modalItem()!._id)!; track img._id) {
                      <div class="relative group/img">
                        <img [src]="img.url" class="w-20 h-20 rounded-lg object-cover cursor-pointer" alt="linked" (click)="modalItem.set(img)" />
                        @if (auth.isAdmin()) {
                          <button type="button"
                                  class="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                                  style="background:var(--danger-500,#ef4444);color:#fff"
                                  [attr.aria-label]="'MEDIA.DELETE_TITLE' | translate"
                                  (click)="$event.stopPropagation(); deleteTarget.set(img)">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    }

    @if (deleteTarget()) {
      <app-confirm-dialog
        [title]="'MEDIA.DELETE_TITLE' | translate"
        [message]="'MEDIA.DELETE_MSG' | translate"
        [confirmLabel]="'COMMON.DELETE' | translate"
        [danger]="true"
        (confirmed)="doDelete()"
        (cancelled)="deleteTarget.set(null)"
      />
    }

    @if (rejectTarget()) {
      <app-reject-reason-dialog
        (confirmed)="confirmReject($event)"
        (cancelled)="rejectTarget.set(null)"
      />
    }
  `
})
export class MediaGalleryComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly mediaService = inject(MediaService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly auth = inject(AuthService);

  readonly media = signal<PlayerMedia[]>([]);
  readonly loading = signal(true);
  readonly showUpload = signal(false);
  readonly modalItem = signal<PlayerMedia | null>(null);
  readonly deleteTarget = signal<PlayerMedia | null>(null);
  readonly rejectTarget = signal<PlayerMedia | null>(null);
  readonly downloading = signal(false);

  private readonly embedCache = new Map<string, SafeResourceUrl>();

  // الصور اللي اترفعت مع فيديو معين — Map مبنية مرة واحدة على تغيير media()، بدل ما نعمل filter لكل فيديو في كل render
  readonly linkedImagesByVideo = computed(() => {
    const map = new Map<string, PlayerMedia[]>();
    for (const item of this.media()) {
      if (item.type === 'image' && item.linkedVideo) {
        const list = map.get(item.linkedVideo) ?? [];
        list.push(item);
        map.set(item.linkedVideo, list);
      }
    }
    return map;
  });


  get playerId(): string {
    return this.route.snapshot.pathFromRoot
      .map(s => s.paramMap.get('playerId'))
      .find(id => id != null) ?? '';
  }

  // الصور المرتبطة بفيديو (linkedVideo) متتعرضش كعنصر منفصل في الشبكة الرئيسية —
  // هي بالفعل ظاهرة كـ badge على الفيديو نفسه وكمجموعة جواه المودال، عشان تبقى واضحة
  // إنها حزمة واحدة مع الفيديو مش صور لوحدها متفرقة في المعرض
  readonly filteredMedia = () => this.media().filter(m => !(m.type === 'image' && m.linkedVideo));

  // Polls while any video is still `processing` — otherwise the tile would show
  // "processing…" forever until the user manually refreshes the page, even though
  // Bunny may finish transcoding within seconds for a small file.
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly POLL_INTERVAL_MS = 5000;

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  load(): void {
    this.loading.set(true);
    this.fetchMedia(() => this.loading.set(false));
  }

  private fetchMedia(onDone?: () => void): void {
    this.mediaService.getAll(this.playerId, { sort: '-createdAt' }).subscribe({
      next: res => {
        this.media.set((res.data as any)?.documents ?? []);
        onDone?.();
        this.schedulePollIfNeeded();
      },
      error: () => onDone?.(),
    });
  }

  private schedulePollIfNeeded(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    const stillProcessing = this.media().some(m => m.type === 'video' && m.status === 'processing');
    if (!stillProcessing) return;
    // Silent reload (no loading spinner) so the grid doesn't flicker every poll
    this.pollTimer = setTimeout(() => this.fetchMedia(), MediaGalleryComponent.POLL_INTERVAL_MS);
  }

  openModal(item: PlayerMedia): void {
    if (item.type === 'video') {
      // Playback is admin-only (bandwidth control) — coaches/observers see the tile
      // (thumbnail + title) and can still download, but the streaming modal never opens for them.
      if (!this.auth.isAdmin() || item.status !== 'ready') return;
    }
    this.modalItem.set(item);
  }

  // Bunny embed URL must be trusted for the iframe; cache so the src stays stable
  safeEmbed(url: string): SafeResourceUrl {
    let safe = this.embedCache.get(url);
    if (!safe) {
      safe = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.embedCache.set(url, safe);
    }
    return safe;
  }

  download(item: PlayerMedia): void {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.mediaService.downloadVideo(this.playerId, item._id).subscribe({
      next: (blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `${(item.title || 'video').replace(/[^\w.-]+/g, '_')}.mp4`;
        a.click();
        URL.revokeObjectURL(objectUrl);
        this.downloading.set(false);
      },
      error: () => this.downloading.set(false),
    });
  }

  onUploadComplete(): void {
    this.showUpload.set(false);
    this.load();
  }

  doDelete(): void {
    const item = this.deleteTarget();
    if (!item) return;
    this.mediaService.delete(this.playerId, item._id).subscribe(() => {
      this.deleteTarget.set(null);
      this.toast.success(this.translate.instant('MEDIA.DELETE_TITLE'));
      this.load();
    });
  }

  reviewBadgeClass(status: string): string {
    if (status === 'approved') return 'bg-green-500/90 text-white';
    if (status === 'rejected') return 'bg-rose-500/90 text-white';
    return 'bg-amber-500/90 text-white';
  }

  review(item: PlayerMedia, reviewStatus: 'approved'): void {
    this.mediaService.review(this.playerId, item._id, reviewStatus).subscribe(() => {
      this.toast.success(this.translate.instant(`MEDIA.REVIEW.${reviewStatus.toUpperCase()}`));
      this.load();
    });
  }

  confirmReject(reasons: MediaRejectionReason[]): void {
    const item = this.rejectTarget();
    if (!item) return;
    this.mediaService.review(this.playerId, item._id, 'rejected', reasons).subscribe(() => {
      this.rejectTarget.set(null);
      this.toast.success(this.translate.instant('MEDIA.REVIEW.REJECTED'));
      this.load();
    });
  }
}
