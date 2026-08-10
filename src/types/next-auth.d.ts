import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    sessionId: string;
    user: DefaultSession["user"] & {
      id: string;
      role: "admin" | "member";
    };
  }

  interface User {
    remember?: boolean;
    role?: "admin" | "member";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    remember?: boolean;
    role?: "admin" | "member";
  }
}
