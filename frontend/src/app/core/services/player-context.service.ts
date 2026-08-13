import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PlayerContextService {
  readonly activePosition = signal<string | null>(null);
  readonly filterPosition = signal<string | null>(null);

  set(position: string | null): void {
    this.activePosition.set(position);
  }

  clear(): void {
    this.activePosition.set(null);
  }

  setFilter(position: string | null): void {
    this.filterPosition.set(position);
  }
}
