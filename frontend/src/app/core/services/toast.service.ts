import { Injectable, signal } from '@angular/core';
import { Toast } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  success(message: string, duration = 4000): void {
    this.add({ type: 'success', message, duration });
  }

  error(message: string, duration = 5000): void {
    this.add({ type: 'error', message, duration });
  }

  warning(message: string, duration = 4000): void {
    this.add({ type: 'warning', message, duration });
  }

  info(message: string, duration = 3500): void {
    this.add({ type: 'info', message, duration });
  }

  dismiss(id: string): void {
    this.toasts.update(ts => ts.filter(t => t.id !== id));
  }

  private add(partial: Omit<Toast, 'id'>): void {
    const id = crypto.randomUUID();
    this.toasts.update(ts => [...ts, { ...partial, id }]);
    setTimeout(() => this.dismiss(id), partial.duration);
  }
}
