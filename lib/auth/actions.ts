'use server';

import { cookies } from 'next/headers';
import { signOut } from './index';
import { TENANT_COOKIE } from '../tenant/context';

export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(TENANT_COOKIE);
  await signOut({ redirectTo: '/login' });
}
