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
        path === "/forgot-password" ||
        path.startsWith("/account/") ||
        path === "/beschikbaar" ||
        path.startsWith("/beschikbaar/") ||
        path.startsWith("/api/auth") ||
        path === "/favicon.ico" ||
        path === "/icon.png" ||
        path === "/apple-icon.png";

      if (isPublic) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
