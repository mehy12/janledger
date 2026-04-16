'use client';

import { createAuthClient } from 'better-auth/client';
import { inferAdditionalFields } from 'better-auth/client/plugins';

const serverOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const authBaseURL = typeof window === 'undefined' ? `${serverOrigin}/api/auth` : `${window.location.origin}/api/auth`;

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [
    inferAdditionalFields({
      user: {
        username: {
          type: 'string',
        },
        phone: {
          type: 'string',
        },
        role: {
          type: 'string',
        },
      },
    }),
  ],
});
