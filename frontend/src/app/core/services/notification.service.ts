import { Injectable, signal, computed } from '@angular/core';
import { SocketNotification } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notifications = signal<SocketNotification[]>([]);
  readonly unreadCount = signal<number>(0);

  add(notification: SocketNotification): void {
    this.notifications.update(ns => [notification, ...ns].slice(0, 20));
    this.unreadCount.update(c => c + 1);
  }

  markAllRead(): void {
    this.unreadCount.set(0);
  }

  clear(): void {
    this.notifications.set([]);
    this.unreadCount.set(0);
  }
}
