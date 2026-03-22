import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// 인증 없이 접근 가능한 경로
const publicPaths = ["/login", "/api/auth"];

// ADMIN 역할만 접근 가능한 경로
const adminPaths = ["/admin", "/api/crawl", "/api/alerts", "/api/admin"];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function isAdminPath(pathname: string): boolean {
  return adminPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // 공개 경로는 인증 없이 허용
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 미인증 사용자는 로그인 페이지로 리다이렉트
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 관리자 경로 접근 제어
  if (isAdminPath(pathname)) {
    const role = (req.auth.user as { role?: string })?.role;
    if (role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: 관리자 권한이 필요합니다" },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
