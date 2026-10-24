// The TakeSure server (spec 16), as seen from the phone. Strictly anonymous: the phone asks once for an install
// token, used only for rate limits, and sends nothing that identifies the person.
// The address comes from the build (EXPO_PUBLIC_API_URL, set from the GitHub variable TAKESURE_API_URL for test
// builds). No address = no server features in this build; store builds don't set it yet.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORE_BUILD } from './edition.ts';

// Store builds never talk to the server in v1, even if a URL is set in the EAS environment by mistake.
export const API_URL = STORE_BUILD ? '' : (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');

/** Whether this build talks to a TakeSure server. */
export const serverAvailable = (url: string = API_URL): boolean => /^https:\/\/[^\s]+$/.test(url);

const TOKEN_KEY = 'takesure:install-token';

export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`server ${status} ${code}`);
  }
}

async function installToken(fresh = false): Promise<string> {
  if (!fresh) {
    const t = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
    if (t) return t;
  }
  const r = await fetch(`${API_URL}/v1/install`, { method: 'POST' });
  if (!r.ok) throw new ServerError(r.status, 'install');
  const { token } = (await r.json()) as { token?: string };
  if (!token) throw new ServerError(r.status, 'install');
  await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
  return token;
}

/** POSTs JSON with the install token; gets a new token once if the server no longer accepts the old one. */
export async function post(path: string, body: unknown): Promise<unknown> {
  if (!serverAvailable()) throw new ServerError(0, 'no_server');
  const send = async (token: string) =>
    fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Install ${token}` },
      body: JSON.stringify(body),
    });
  let r = await send(await installToken());
  if (r.status === 401) r = await send(await installToken(true));
  if (!r.ok) {
    let code = '';
    try {
      code = String(((await r.json()) as { error?: string }).error ?? '');
    } catch {
      // not JSON
    }
    throw new ServerError(r.status, code);
  }
  return r.status === 204 ? null : r.json().catch(() => null);
}
