import { Component, input, output, signal, computed, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MediaService } from '../services/media.service';
import { ToastService } from '../../../core/services/toast.service';
import { UploadEligibility } from '../../../core/models/player-media.model';

// Fallbacks only, used until the server-driven limits load (see ngOnInit).
// Client-side check is a courtesy — the authoritative cap is enforced
// server-side after Bunny reports the finished size (BUNNY_MAX_VIDEO_MB, F2).
const FALLBACK_MAX_IMAGE_MB = 10;
const FALLBACK_MAX_VIDEO_MB = 50;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_COMPANION_IMAGES = 2;

@Component({
    selector: 'app-media-upload',
    imports: [FormsModule, TranslatePipe],
    styles: [`
      @keyframes shimmer {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(200%); }
      }
      @keyframes indeterminate {
        0%   { left: -40%; width: 40%; }
        60%  { left: 100%; width: 40%; }
        100% { left: 100%; width: 40%; }
      }
      .progress-shimmer::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%);
        animation: shimmer 1.4s ease-in-out infinite;
      }
      .indeterminate-bar {
        position: relative;
        overflow: hidden;
      }
      .indeterminate-bar::before {
        content: '';
        position: absolute;
        top: 0; bottom: 0;
        background: linear-gradient(90deg, transparent, #8b5cf6, #a78bfa, transparent);
        animation: indeterminate 1.6s ease-in-out infinite;
        border-radius: 9999px;
      }
      :host { display: contents; }
    `],
    template: `
    <div class="card p-5 space-y-4">
      <h3 class="text-sm font-semibold" style="color:var(--text-primary)">{{ 'MEDIA.FORM.TITLE' | translate }}</h3>

      <!-- Gate state: load failure → error panel with retry, nothing else renders -->
      @if (gateError()) {
        <div class="rounded-xl p-4 space-y-2 text-center" style="background:rgba(244,63,94,0.06);border:1px solid rgba(244,63,94,0.2)">
          <p class="text-sm" style="color:var(--text-secondary)">{{ 'MEDIA.FORM.ELIGIBILITY_LOAD_FAILED' | translate }}</p>
          <button type="button" class="btn btn-secondary btn-sm" (click)="loadUploadGate()">{{ 'MEDIA.FORM.RETRY' | translate }}</button>
        </div>
      } @else {

          <!-- Drop zone (video only) -->
          <div
            class="border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer"
            [class]="isDragOver() ? 'border-primary-500 bg-primary-50/50' : 'border-[var(--border-color)] hover:border-primary-400'"
            (dragover)="onDragOver($event)"
            (dragleave)="isDragOver.set(false)"
            (drop)="onDrop($event)"
            (click)="fileInput.click()"
          >
            @if (selectedFile()) {
              <div class="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-3"
                   style="background:rgba(139,92,246,0.12)">
                <svg class="w-8 h-8" style="color:#8b5cf6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
              </div>
              <p class="text-sm font-semibold" style="color:var(--text-primary)">{{ selectedFile()?.name }}</p>
              <p class="text-xs mt-1" style="color:var(--text-muted)">{{ formatSize(selectedFile()?.size) }}</p>
            } @else {
              <svg class="w-10 h-10 mx-auto mb-3" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
              </svg>
              <p class="text-sm font-medium" style="color:var(--text-primary)">{{ 'MEDIA.FORM.DROP' | translate }}</p>
            }
          </div>

          <!-- Size hint -->
          <div class="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
               style="background:rgba(59,130,246,0.08);color:var(--text-secondary);border:1px solid rgba(59,130,246,0.2)">
            <svg class="w-3.5 h-3.5 shrink-0" style="color:#3b82f6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{{ 'MEDIA.FORM.HINT' | translate }}</span>
          </div>

          <input #fileInput type="file" class="hidden" accept="video/mp4" (change)="onFileChange($event)" />

          <!-- Meta fields — required in freeform mode (no match to auto-link); can be filled in any
               order relative to picking the video/companion images, submit is only gated at the end -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">
                {{ 'MEDIA.FORM.TITLE_FIELD' | translate }} @if (isFreeform()) { <span style="color:#f43f5e">*</span> }
              </label>
              <input [ngModel]="title()" (ngModelChange)="title.set($event)" type="text" class="form-input text-sm" [placeholder]="'MEDIA.FORM.TITLE_PH' | translate" maxlength="100" />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">
                {{ 'MEDIA.FORM.DESC' | translate }} @if (isFreeform()) { <span style="color:#f43f5e">*</span> }
              </label>
              <input [ngModel]="description()" (ngModelChange)="description.set($event)" type="text" class="form-input text-sm" [placeholder]="'MEDIA.FORM.DESC_PH' | translate" maxlength="500" />
            </div>
          </div>

          @if (isFreeform()) {
            <p class="text-[11px]" style="color:var(--text-muted)">{{ 'MEDIA.FORM.TITLE_DESC_REQUIRED_HINT' | translate }}</p>
          } @else if (uploadGate()?.mode === 'gated' && uploadGate()?.seasonMatch) {
            <p class="text-xs" style="color:var(--text-secondary)">
              {{ 'MEDIA.FORM.AUTO_LINKED_MATCH' | translate: { teams: matchTeams(), date: matchDate() } }}
            </p>
          }

          <!-- Companion photos (required — at least 1, up to 2) — uploaded right after the video succeeds, linked to it -->
          @if (!uploading()) {
            <div class="space-y-1.5">
              <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'MEDIA.FORM.COMPANION_IMAGES' | translate }} <span style="color:#f43f5e">*</span></label>
              <div class="flex flex-wrap gap-2">
                @for (img of companionImages(); track $index) {
                  <div class="relative">
                    <img [src]="companionPreviews()[$index]" class="w-16 h-16 rounded-lg object-cover" alt="companion" />
                    <button type="button" class="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs"
                            style="background:var(--danger-500,#ef4444);color:#fff" (click)="removeCompanionImage($index)">×</button>
                  </div>
                }
                @if (companionImages().length < 2) {
                  <button type="button" class="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center"
                          style="border-color:var(--border-color)" (click)="companionInput.click()">
                    <svg class="w-5 h-5" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </button>
                }
              </div>
              <input #companionInput type="file" class="hidden" accept="image/jpeg,image/png,image/webp" (change)="onCompanionImageChange($event)" />
              <p class="text-[11px]" [style.color]="companionImages().length === 0 ? '#f43f5e' : 'var(--text-muted)'">
                {{ (companionImages().length === 0 ? 'MEDIA.FORM.COMPANION_IMAGES_REQUIRED_HINT' : 'MEDIA.FORM.COMPANION_IMAGES_HINT') | translate }}
              </p>
            </div>
          }

          @if (uploadingCompanions()) {
            <p class="text-xs" style="color:var(--text-secondary)">{{ 'MEDIA.FORM.UPLOADING_COMPANION_IMAGES' | translate }}</p>
          }

          <!-- ═══════════════ UPLOAD PROGRESS ═══════════════ -->
          @if (uploading()) {

            <!-- Phase 1: Uploading to server -->
            @if (!processing()) {
              <div class="rounded-xl p-4 space-y-3"
                   style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.18)">

                <!-- Header row -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                         style="background:rgba(34,197,94,0.15)">
                      <svg class="w-3.5 h-3.5 animate-spin" style="color:#22c55e" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    </div>
                    <span class="text-xs font-semibold" style="color:#22c55e">{{ 'MEDIA.FORM.UPLOADING' | translate }}</span>
                  </div>

                  <!-- Big percentage -->
                  <span class="text-2xl font-black tabular-nums" style="color:#22c55e;letter-spacing:-0.5px">
                    {{ uploadProgress() }}<span class="text-sm font-semibold">%</span>
                  </span>
                </div>

                <!-- Progress track -->
                <div class="relative w-full rounded-full overflow-hidden"
                     style="height:8px;background:rgba(34,197,94,0.12)">
                  <div class="progress-shimmer absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out"
                       [style.width]="uploadProgress() + '%'"
                       style="background:linear-gradient(90deg,#16a34a,#22c55e,#4ade80);
                              box-shadow:0 0 8px rgba(34,197,94,0.6)">
                  </div>
                </div>

                <!-- Bytes loaded / total -->
                <div class="flex items-center justify-between text-xs" style="color:var(--text-muted)">
                  <span>{{ formatSize(loadedBytes()) }} / {{ formatSize(selectedFile()?.size) }}</span>
                  <span>{{ uploadProgress() < 100 ? ('MEDIA.FORM.UPLOADING' | translate) : 'Finalizing...' }}</span>
                </div>
              </div>

            <!-- Phase 2: Server processing (Bunny transcode) -->
            } @else {
              <div class="rounded-xl p-4 space-y-3"
                   style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.2)">

                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                         style="background:rgba(139,92,246,0.15)">
                      <svg class="w-3.5 h-3.5 animate-spin" style="color:#8b5cf6" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    </div>
                    <div>
                      <p class="text-xs font-semibold" style="color:#a78bfa">{{ 'MEDIA.FORM.PROCESSING' | translate }}</p>
                      <p class="text-[10px] mt-0.5" style="color:var(--text-muted)">{{ 'MEDIA.FORM.PROCESSING_HINT' | translate }}</p>
                    </div>
                  </div>
                  <span class="text-2xl font-black" style="color:#8b5cf6">100<span class="text-sm font-semibold">%</span></span>
                </div>

                <!-- Indeterminate animated bar -->
                <div class="indeterminate-bar w-full rounded-full"
                     style="height:8px;background:rgba(139,92,246,0.15)"></div>

                <p class="text-[10px]" style="color:var(--text-muted)">
                  This may take up to a minute for large videos. Please don't close the page.
                </p>
              </div>
            }
          }

          <!-- Actions -->
          <div class="flex gap-3">
            <button class="btn btn-primary btn-sm" [disabled]="!canSubmit()" (click)="upload()">
              @if (uploading()) {
                <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              }
              {{ uploading() ? ('MEDIA.FORM.UPLOADING' | translate) : ('MEDIA.FORM.UPLOAD' | translate) }}
            </button>
            <button class="btn btn-secondary btn-sm" [disabled]="uploading()" (click)="cancelled.emit()">{{ 'MEDIA.FORM.CANCEL' | translate }}</button>
            @if (selectedFile() && !uploading()) {
              <button class="btn btn-ghost btn-sm ml-auto" (click)="clearFile()">{{ 'MEDIA.FORM.CLEAR' | translate }}</button>
            }
          </div>
      }
    </div>
  `
})
export class MediaUploadComponent implements OnInit {
    readonly playerId = input.required<string>();
    readonly uploadComplete = output<void>();
    readonly cancelled = output<void>();

    private readonly mediaService = inject(MediaService);
    private readonly toast = inject(ToastService);
    private readonly translate = inject(TranslateService);

    readonly isDragOver     = signal(false);
    readonly selectedFile   = signal<File | null>(null);
    readonly uploading      = signal(false);
    readonly processing     = signal(false);
    readonly uploadProgress = signal(0);
    readonly loadedBytes    = signal(0);

    // Server-driven upload caps — never hardcode; fall back only until they load.
    readonly maxImageSize = signal(FALLBACK_MAX_IMAGE_MB * 1024 * 1024);
    readonly maxVideoSize = signal(FALLBACK_MAX_VIDEO_MB * 1024 * 1024);

    // بوابة رفع الفيديو (mediaMatchGate على السيرفر) — بتتحمل قبل ما اليوزر يختار أي ملف
    // عشان نعرف نعرض له فورًا: مقفول، أو حر (لازم عنوان ووصف)، أو هيترابط بماتش تلقائي
    readonly uploadGate = signal<UploadEligibility | null>(null);
    readonly gateError  = signal(false);

    readonly isFreeform = computed(() => this.uploadGate()?.mode === 'freeform');

    // صور مرفقة (لازم صورة واحدة على الأقل مع الفيديو، وحتى صورتين) — بترفع بعد نجاح الفيديو وبتترابط بيه عن طريق linkedVideo
    readonly companionImages   = signal<File[]>([]);
    readonly companionPreviews = signal<string[]>([]);
    readonly uploadingCompanions = signal(false);

    readonly canSubmit = computed(() => {
        const gate = this.uploadGate();
        if (!gate || this.gateError()) return false;
        if (!this.selectedFile() || this.uploading()) return false;
        if (this.companionImages().length === 0) return false;
        if (gate.mode === 'freeform' && (!this.title().trim() || !this.description().trim())) return false;
        return true;
    });

    readonly title = signal('');
    readonly description = signal('');

    private currentUpload: import('tus-js-client').Upload | null = null;

    ngOnInit(): void {
        this.mediaService.getMediaLimits().subscribe({
            next: res => {
                if (res.data?.maxImageMB) this.maxImageSize.set(res.data.maxImageMB * 1024 * 1024);
                if (res.data?.maxVideoMB) this.maxVideoSize.set(res.data.maxVideoMB * 1024 * 1024);
            },
            // network hiccup — keep the fallback caps, not fatal to the upload flow
            error: () => {},
        });

        this.loadUploadGate();
    }

    loadUploadGate(): void {
        this.gateError.set(false);
        this.uploadGate.set(null);
        this.mediaService.getUploadEligibility(this.playerId()).subscribe({
            next: res => this.uploadGate.set(res.data ?? { mode: 'freeform' }),
            error: () => this.gateError.set(true),
        });
    }

    private matchTeamName(team: NonNullable<UploadEligibility['seasonMatch']>['homeTeam']): string {
        return typeof team === 'string' ? team : team.name;
    }

    matchTeams(): string {
        const m = this.uploadGate()?.seasonMatch;
        if (!m) return '';
        return `${this.matchTeamName(m.homeTeam)} vs ${this.matchTeamName(m.awayTeam)}`;
    }

    matchDate(): string {
        const m = this.uploadGate()?.seasonMatch;
        return m ? new Date(m.matchDate).toLocaleDateString() : '';
    }

    onDragOver(event: DragEvent): void {
        event.preventDefault();
        this.isDragOver.set(true);
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        this.isDragOver.set(false);
        const file = event.dataTransfer?.files[0];
        if (file) this.selectFile(file);
    }

    onFileChange(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) this.selectFile(file);
    }

    private selectFile(file: File): void {
        if (file.type !== 'video/mp4') {
            this.toast.error(this.translate.instant('MEDIA.FORM.HINT'));
            return;
        }
        if (file.size > this.maxVideoSize()) {
            this.toast.error(this.translate.instant('MEDIA.FORM.HINT'));
            return;
        }
        this.selectedFile.set(file);
    }

    clearFile(): void {
        this.selectedFile.set(null);
        this.companionImages.set([]);
        this.companionPreviews.set([]);
    }

    onCompanionImageChange(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        (event.target as HTMLInputElement).value = '';
        if (!file) return;
        if (!IMAGE_TYPES.includes(file.type)) {
            this.toast.error(this.translate.instant('MEDIA.FORM.HINT'));
            return;
        }
        if (file.size > this.maxImageSize()) {
            this.toast.error(this.translate.instant('MEDIA.FORM.HINT'));
            return;
        }
        if (this.companionImages().length >= MAX_COMPANION_IMAGES) return;

        this.companionImages.update(list => [...list, file]);
        const reader = new FileReader();
        reader.onload = e => this.companionPreviews.update(list => [...list, e.target?.result as string]);
        reader.readAsDataURL(file);
    }

    removeCompanionImage(index: number): void {
        this.companionImages.update(list => list.filter((_, i) => i !== index));
        this.companionPreviews.update(list => list.filter((_, i) => i !== index));
    }

    // بعد ما الفيديو يترفع بنجاح، بترفع الصور المرفقة واحدة ورا التانية وتترابط بيه —
    // لو صورة فشلت بنكمل البواقي وميترجعش الفيديو اللي خلص فعلاً
    private async uploadCompanionImages(playerId: string, videoId: string): Promise<void> {
        const images = this.companionImages();
        if (images.length === 0) return;

        this.uploadingCompanions.set(true);
        let failures = 0;
        for (const image of images) {
            try {
                await new Promise<void>((resolve, reject) => {
                    this.mediaService.upload(playerId, image, videoId).subscribe({
                        next: event => { if (event.type === HttpEventType.Response) resolve(); },
                        error: reject,
                    });
                });
            } catch {
                failures++;
            }
        }
        this.uploadingCompanions.set(false);

        if (failures > 0) {
            this.toast.error(this.translate.instant('MEDIA.FORM.COMPANION_IMAGE_UPLOAD_FAILED', { count: failures }));
        }
    }

    // SHA-256 hex digest of the file — computed client-side so the backend can detect
    // whether this exact video was already uploaded for this player (bytes never touch our server).
    private async computeFileHash(file: File): Promise<string> {
        const buffer = await file.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ── VIDEO → direct-to-Bunny over TUS (the VPS never receives the bytes) ──
    upload(): void {
        if (!this.canSubmit()) return;
        const file = this.selectedFile();
        if (!file) return;

        this.uploading.set(true);
        this.processing.set(false);
        this.uploadProgress.set(0);
        this.loadedBytes.set(0);

        this.computeFileHash(file).then(fileHash => {
            this.mediaService.createVideo(this.playerId(), {
                title: this.title() || undefined,
                description: this.description() || undefined,
                fileHash,
            }).subscribe({
            next: res => {
                const envelope = res.data!.upload;
                const videoId = res.data!.document._id;
                this.mediaService.uploadVideoToBunny(envelope, file, {
                    onProgress: (loaded, total) => {
                        this.uploadProgress.set(Math.min(99, Math.round((loaded / total) * 100)));
                        this.loadedBytes.set(loaded);
                        if (loaded >= total) {
                            this.uploadProgress.set(100);
                            this.processing.set(true); // bytes done → Bunny now transcodes
                        }
                    },
                    onSuccess: async () => {
                        this.currentUpload = null;
                        this.uploadProgress.set(100);
                        this.processing.set(false);
                        this.uploading.set(false);
                        // الفيديو خلص واترفع فعلاً — دلوقتي بس نرفع الصور المرفقة وتترابط بيه
                        await this.uploadCompanionImages(this.playerId(), videoId);
                        this.toast.success(this.translate.instant('MEDIA.UPLOAD_MEDIA'));
                        this.uploadComplete.emit(); // gallery reloads → shows "processing" until ready
                    },
                    onError: () => {
                        this.currentUpload = null;
                        this.uploading.set(false);
                        this.processing.set(false);
                        this.uploadProgress.set(0);
                        this.loadedBytes.set(0);
                        this.toast.error(this.translate.instant('MEDIA.FORM.UPLOAD_FAILED'));
                    },
                }).then(upload => { this.currentUpload = upload; })
                    .catch(() => {
                        this.uploading.set(false);
                        this.processing.set(false);
                        this.toast.error(this.translate.instant('MEDIA.FORM.UPLOAD_FAILED'));
                    });
            },
            // create rejected (outside the upload window / caps) — the interceptor's
            // MESSAGE_MAP translates the real reason; the gate is re-checked server-side
            // regardless of what this page rendered, so a stale "allowed" state can still 400 here.
            error: () => {
                this.uploading.set(false);
                this.processing.set(false);
            },
        });
        }).catch(() => {
            this.uploading.set(false);
            this.processing.set(false);
            this.toast.error(this.translate.instant('MEDIA.FORM.UPLOAD_FAILED'));
        });
    }

    formatSize(bytes?: number | null): string {
        if (!bytes) return '0 KB';
        return bytes < 1024 * 1024
            ? `${(bytes / 1024).toFixed(1)} KB`
            : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
}
