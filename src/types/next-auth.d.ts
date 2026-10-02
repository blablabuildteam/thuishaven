import type { DefaultSession } from "next-auth";
import type { ToolAccess } from "@/lib/auth/tool-access";

declare module "next-auth" {
  interface Session {
    sessionId: string;
    user: DefaultSession["user"] & {
      id: string;
      role: "admin" | "member";
      toolAccess: ToolAccess;
    };
  }

  interface User {
    remember?: boolean;
    role?: "admin" | "member";
    toolAccess?: ToolAccess;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    remember?: boolean;
    role?: "admin" | "member";
    toolAccess?: ToolAccess;
  }
}
