import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const allowedEmails = new Set(
  (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    error: "/forbidden",
  },
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      return allowedEmails.has(email);
    },
    jwt({ token, profile }) {
      if (profile?.email) {
        token.email = profile.email;
      }
      return token;
    },
    session({ session, token }) {
      if (token.email) {
        session.user = { ...session.user, email: token.email as string };
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
