import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/review";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.session) {
      // Store the Google provider token in a cookie so API routes can use it
      // for Gmail API calls (creating drafts, etc.)
      const providerToken = data.session.provider_token;
      const providerRefreshToken = data.session.provider_refresh_token;

      const response = NextResponse.redirect(`${origin}${next}`);

      if (providerToken) {
        response.cookies.set("google_access_token", providerToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60, // 1 hour (Google access tokens expire)
          path: "/",
        });
      }

      if (providerRefreshToken) {
        response.cookies.set("google_refresh_token", providerRefreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30, // 30 days
          path: "/",
        });
      }

      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
