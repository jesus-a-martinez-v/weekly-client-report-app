export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/((?!api/auth|signin|forbidden|_next|favicon\\.ico|.*\\..*).*)"],
};
