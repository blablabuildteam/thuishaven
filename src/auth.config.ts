import type { NextAuthConfig } from "next-auth";
import {
  canAccessPath,
  homePathForAccess,
  normalizeToolAccess,
} from "@/lib/auth/tool-access";

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
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) ?? "";
        session.user.role =
          (token.role as "admin" | "member" | undefined) ?? "member";
        session.user.toolAccess = normalizeToolAccess(
          token.toolAccess,
          session.user.role,
        );
      }
      session.sessionId =
        (token.jti as string) || (token.sub as string) || "";
      return session;
    },
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
        path.startsWith("/api/cron") ||
        path.startsWith("/api/outreach/webhooks/") ||
        path === "/favicon.ico" ||
        path === "/icon.png" ||
        path === "/apple-icon.png";

      if (isPublic) return true;
      if (!auth?.user) return false;

      const role = auth.user.role ?? "member";
      const access = normalizeToolAccess(auth.user.toolAccess, role);

      const needsAdmin =
        path === "/koppelingen" ||
        path.startsWith("/koppelingen/") ||
        path.startsWith("/dashboard/logs") ||
        path.startsWith("/admin");
      if (needsAdmin && role !== "admin") {
        return Response.redirect(
          new URL(homePathForAccess(access), request.nextUrl),
        );
      }

      if (!canAccessPath(path, access, role)) {
        return Response.redirect(
          new URL(homePathForAccess(access), request.nextUrl),
        );
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
