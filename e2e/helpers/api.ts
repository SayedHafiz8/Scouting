import { APIRequestContext } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://localhost:3000/api/v1';

/** Login via the backend API and return the access token. */
export async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  const body = await res.json();
  if (!res.ok()) throw new Error(`apiLogin failed: ${body.message ?? res.status()}`);
  return body.data.accessToken as string;
}

export interface PlayerPayload {
  name: string;
  dateOfBirth: string;
  team?: string;     // must be a real Team ObjectId if provided
  teamName?: string;  // free-text team name — mutually exclusive with `team`
  position: string;
  preferredFoot: string;
  nationality: string;
  city: string;
  address: string;
  phoneNumber: string;
}

/** Create a player via API and return its _id. Requires a coach token. */
export async function apiCreatePlayer(
  request: APIRequestContext,
  token: string,
  payload: PlayerPayload,
): Promise<string> {
  const res = await request.post(`${API}/players`, {
    data: payload,
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok()) throw new Error(`apiCreatePlayer failed: ${body.message ?? res.status()}`);
  return body.data.document._id as string;
}

/** Permanently delete a player via API. Requires an admin token. */
export async function apiDeletePlayer(
  request: APIRequestContext,
  token: string,
  playerId: string,
): Promise<void> {
  await request.delete(`${API}/players/${playerId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
