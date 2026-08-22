import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, LoginPayload, SignupPayload, UpdateProfilePayload, ChangePasswordPayload, AuthResponse } from '../models/user.model';
import { ApiResponse } from '../models/api-response.model';
import { SocketService } from '../services/socket.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly socketService = inject(SocketService);

  private readonly baseUrl = `${environment.apiUrl}/auth`;

  readonly currentUser = signal<User | null>(null);
  readonly accessToken = signal<string | null>(null);

  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');
  readonly isCoach = computed(() => this.currentUser()?.role === 'coach');
  readonly isObserver = computed(() => this.currentUser()?.role === 'observer');
  // Stage 4 — the players page gates on these computeds in ~10 template positions,
  // so proScout needs one too. UserRole is derived from openapi.json, so 'proScout'
  // here is checked against the generated union, not a free-floating literal.
  readonly isProScout = computed(() => this.currentUser()?.role === 'proScout');

  // Guards await this before checking auth state
  readonly whenReady: Promise<void>;
  readonly isReady = signal(false);
  private markReady!: () => void;

  constructor() {
    this.whenReady = new Promise<void>(resolve => (this.markReady = resolve));
  }

  async login(payload: LoginPayload): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<AuthResponse>>(
        `${this.baseUrl}/login`,
        payload,
        { withCredentials: true }
      )
    );
    if (res.data) this.setSession(res.data.user, res.data.accessToken);
  }

  async signup(payload: SignupPayload): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<AuthResponse>>(
        `${this.baseUrl}/signup`,
        payload,
        { withCredentials: true }
      )
    );
    if (res.data) this.setSession(res.data.user, res.data.accessToken);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post<ApiResponse<void>>(
          `${this.baseUrl}/logout`,
          {},
          { withCredentials: true }
        )
      );
    } finally {
      this.clearSession();
      this.router.navigate(['/auth/login']);
    }
  }

  async refreshAccessToken(): Promise<string> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<{ accessToken: string; user: User }>>(
        `${this.baseUrl}/refreshToken`,
        {},
        { withCredentials: true }
      )
    );
    const token = res.data?.accessToken ?? '';
    const user = res.data?.user ?? null;
    this.accessToken.set(token);
    if (user) {
      this.currentUser.set(user);
      sessionStorage.setItem('tr_user', JSON.stringify(user));
    }
    return token;
  }

  async loadUserFromToken(): Promise<void> {
    try {
      const token = await this.refreshAccessToken();
      this.socketService.connect(token);
    } catch {
      this.clearSession();
    } finally {
      this.markReady();
      this.isReady.set(true);
    }
  }

  async forgotPassword(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post<ApiResponse<void>>(`${this.baseUrl}/forgotPassword`, { email })
    );
  }

  async verifyResetCode(resetCode: string): Promise<void> {
    await firstValueFrom(
      this.http.post<ApiResponse<void>>(`${this.baseUrl}/verifyResetCode`, { resetCode })
    );
  }

  async resetPassword(email: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.put<ApiResponse<{ accessToken: string }>>(
        `${this.baseUrl}/resetPassword`,
        { email, newPassword },
        { withCredentials: true }
      )
    );
    // Server sets a new refreshToken cookie; use it to restore the full session (user + token)
    await this.loadUserFromToken();
  }

  async changePassword(payload: ChangePasswordPayload): Promise<void> {
    const res = await firstValueFrom(
      this.http.patch<ApiResponse<{ accessToken: string }>>(
        `${this.baseUrl}/changeMyPassword`,
        payload,
        { withCredentials: true }
      )
    );
    if (res.data?.accessToken) {
      this.accessToken.set(res.data.accessToken);
    }
  }

  async updateProfile(payload: UpdateProfilePayload): Promise<User> {
    const res = await firstValueFrom(
      this.http.patch<ApiResponse<{ user: User }>>(
        `${this.baseUrl}/updateLoggedUser`,
        payload,
        { withCredentials: true }
      )
    );
    if (res.data?.user) {
      this.currentUser.set(res.data.user);
      sessionStorage.setItem('tr_user', JSON.stringify(res.data.user));
    }
    return res.data!.user;
  }

  // بيتأكد من باسورد تسجيل الدخول بتاع الأدمن تاني، وبيرجع vault token صالح لمدة 15 دقيقة
  // يُستخدم لفتح صور البطاقة الشخصية
  async verifyVaultPassword(password: string): Promise<{ vaultToken: string; expiresIn: number }> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<{ vaultToken: string; expiresIn: number }>>(
        `${this.baseUrl}/vaultPassword/verify`,
        { password },
        { withCredentials: true }
      )
    );
    return res.data!;
  }

  setSession(user: User, token: string): void {
    this.currentUser.set(user);
    this.accessToken.set(token);
    sessionStorage.setItem('tr_user', JSON.stringify(user));
    this.socketService.connect(token);
  }

  clearSession(): void {
    this.currentUser.set(null);
    this.accessToken.set(null);
    sessionStorage.removeItem('tr_user');
    this.socketService.disconnect();
  }
}
