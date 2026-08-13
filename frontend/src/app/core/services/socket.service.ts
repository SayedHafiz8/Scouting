import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { SocketNotification, ObserverEvaluationPublished, CoachEvaluationPublished } from '../models/notification.model';
import { AdminDashboard, CoachDashboard, ObserverDashboard } from '../models/dashboard.model';
import { PlayerStatus } from '../models/player.model';

export type ConnectionState = 'connected' | 'disconnected' | 'error';

@Injectable({ providedIn: 'root' })
export class SocketService {
  readonly connectionState = signal<ConnectionState>('disconnected');

  private socket: Socket | null = null;

  readonly notification$ = new Subject<SocketNotification>();
  readonly adminDashboardUpdate$ = new Subject<AdminDashboard>();
  readonly coachDashboardUpdate$ = new Subject<CoachDashboard>();
  readonly observerDashboardUpdate$ = new Subject<ObserverDashboard>();
  readonly playerStatusUpdated$ = new Subject<{ playerId: string; status: PlayerStatus }>();
  readonly observerEvaluationPublished$ = new Subject<ObserverEvaluationPublished>();
  readonly coachEvaluationPublished$ = new Subject<CoachEvaluationPublished>();

  connect(token: string): void {
    if (this.socket?.connected) return;

    const url = environment.socketUrl || window.location.origin;
    this.socket = io(url, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    this.socket.on('connect', () => {
      this.connectionState.set('connected');
    });

    this.socket.on('disconnect', () => {
      this.connectionState.set('disconnected');
    });

    this.socket.on('connect_error', () => {
      this.connectionState.set('error');
    });

    this.socket.on('notification', (data: SocketNotification) => {
      if (data.type === 'ADMIN_DASHBOARD_UPDATE' && data.data) {
        this.adminDashboardUpdate$.next(data.data as AdminDashboard);
      } else if (data.type === 'COACH_DASHBOARD_UPDATE' && data.data) {
        this.coachDashboardUpdate$.next(data.data as CoachDashboard);
      } else if (data.type === 'OBSERVER_DASHBOARD_UPDATE' && data.data) {
        this.observerDashboardUpdate$.next(data.data as ObserverDashboard);
      } else if (data.type === 'PLAYER_STATUS_UPDATED' && data.playerId && data.status) {
        this.playerStatusUpdated$.next({ playerId: data.playerId, status: data.status });
      } else if (data.type === 'OBSERVER_EVALUATION_PUBLISHED' && data.data) {
        this.observerEvaluationPublished$.next(data.data as ObserverEvaluationPublished);
        this.notification$.next(data);
      } else if (data.type === 'COACH_EVALUATION_PUBLISHED' && data.data) {
        this.coachEvaluationPublished$.next(data.data as CoachEvaluationPublished);
        this.notification$.next(data);
      } else {
        this.notification$.next(data);
      }
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connectionState.set('disconnected');
    this.notification$.complete();
    this.adminDashboardUpdate$.complete();
    this.coachDashboardUpdate$.complete();
    this.observerDashboardUpdate$.complete();
    this.playerStatusUpdated$.complete();
    this.observerEvaluationPublished$.complete();
    this.coachEvaluationPublished$.complete();
  }

  getNotifications() { return this.notification$.asObservable(); }
  getAdminUpdates() { return this.adminDashboardUpdate$.asObservable(); }
  getCoachUpdates() { return this.coachDashboardUpdate$.asObservable(); }
  getObserverUpdates() { return this.observerDashboardUpdate$.asObservable(); }
  getPlayerStatusUpdates() { return this.playerStatusUpdated$.asObservable(); }
  getObserverEvaluationUpdates() { return this.observerEvaluationPublished$.asObservable(); }
  getCoachEvaluationUpdates() { return this.coachEvaluationPublished$.asObservable(); }
}
