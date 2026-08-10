import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 90 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isPublic =
        path === "/login" ||
        path.startsWith("/login/") ||
        path === "/beschikbaar" ||
        path.startsWith("/beschikbaar/") ||
        path.startsWith("/api/auth");

      if (isPublic) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
