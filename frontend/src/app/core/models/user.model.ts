import type { components, paths } from './api.generated';

type _Schema = components['schemas']['User'];

export type UserRole = NonNullable<_Schema['role']>;

export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  profileImg?: string;
  phoneNumber?: string;
  address?: string;
  birthDate?: string;
  active: boolean;
  deactivatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Presence flags — the ID-card bytes are streamed separately (never a URL). C3.
export interface IdCardPresence {
  front: boolean;
  back: boolean;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export type LoginPayload =
  paths['/auth/login']['post']['requestBody']['content']['application/json'];

export type UpdateProfilePayload =
  paths['/auth/updateLoggedUser']['patch']['requestBody']['content']['application/json'];

export type ChangePasswordPayload =
  paths['/auth/changeMyPassword']['patch']['requestBody']['content']['application/json'];

// /users POST body + optional role (admins can set this, though not in the public spec)
export type CreateUserPayload =
  paths['/users']['post']['requestBody']['content']['application/json'] & {
    role?: UserRole;
  };

// No signup route in the spec; kept for the dead-code path in AuthService.signup()
export interface SignupPayload {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  phoneNumber?: string;
}
