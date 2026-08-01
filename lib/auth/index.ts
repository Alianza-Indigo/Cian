/**
 * Auth.js (NextAuth v5) con Google OAuth y sesiones en base de datos.
 *
 * La configuracion se construye por peticion (forma de funcion de NextAuth)
 * para que la conexion a Postgres se resuelva en tiempo de ejecucion y no al
 * importar el modulo. Asi `next build` no necesita base de datos.
 */
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { Adapter } from 'next-auth/adapters';
import { getDb } from '../db/client';
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from '../db/schema/auth';
import { createUserWithPersonalTenant } from './provisioning';

let cachedAdapter: Adapter | undefined;

function getAdapter(): Adapter {
  if (!cachedAdapter) {
    const base = DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    });

    // El alta de una persona nueva pasa por nuestra transaccion, no por la del
    // adaptador: ademas del usuario crea su tenant personal y su membresia.
    cachedAdapter = { ...base, createUser: createUserWithPersonalTenant };
  }

  return cachedAdapter;
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: getAdapter(),
  session: {
    // Sesion en base de datos, no JWT: revocar un acceso debe surtir efecto
    // de inmediato (lo necesitara el equipo de apoyo en la Fase 8).
    strategy: 'database' as const,
    maxAge: 60 * 60 * 24 * 30,
  },
  providers: [
    Google({
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  trustHost: true,
}));
