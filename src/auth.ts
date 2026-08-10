import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { findUserByEmail, verifyUserPassword } from "@/lib/auth/users";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.string().optional(),
});

const SESSION_DAYS_DEFAULT = 30;
const SESSION_DAYS_REMEMBER = 90;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "E-mail",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Wachtwoord", type: "password" },
        remember: { label: "Onthoud mij", type: "text" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const user = await findUserByEmail(email);
        if (!user || !user.active) return null;

        const ok = await verifyUserPassword(user, parsed.data.password);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          remember: parsed.data.remember === "true",
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.sub = user.id;
        token.role = (user as { role?: string }).role ?? "member";
        const remember =
          "remember" in user
            ? Boolean((user as { remember?: boolean }).remember)
            : true;
        token.remember = remember;
        const days = remember ? SESSION_DAYS_REMEMBER : SESSION_DAYS_DEFAULT;
        token.exp = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = (token.name as string) ?? "";
        session.user.id = (token.sub as string) ?? "";
        session.user.role =
          (token.role as "admin" | "member" | undefined) ?? "member";
      }
      session.sessionId =
        (token.jti as string) || (token.sub as string) || "";
      return session;
    },
  },
});
