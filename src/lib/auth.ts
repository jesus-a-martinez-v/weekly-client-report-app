import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.toLowerCase().trim();
        const password = credentials?.password as string | undefined;

        const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
        const hash = process.env.ADMIN_PASSWORD_HASH;

        if (!email || !password || !adminEmail || !hash) return null;
        if (email !== adminEmail) return null;

        const ok = await bcrypt.compare(password, hash);
        if (!ok) return null;

        return { id: adminEmail, email: adminEmail };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    error: "/forbidden",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.email) {
        const email = token.email as string;
        session.user = { ...session.user, email };
        const { setUser } = await import("@sentry/nextjs");
        setUser({ email });
      } else {
        const { setUser } = await import("@sentry/nextjs");
        setUser(null);
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      const publicPaths = ["/signin", "/forbidden"];
      if (publicPaths.some((p) => pathname.startsWith(p))) return true;
      if (pathname.startsWith("/api/auth")) return true;
      return !!session?.user;
    },
  },
});
