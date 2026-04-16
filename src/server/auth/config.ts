// config.ts
import { type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "~/server/db";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "~/env";

const globalRedis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

// Per-username: 防暴力破解單一帳號
const loginUserRateLimit = new Ratelimit({
  redis: globalRedis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  analytics: true,
  prefix: "ratelimit:login:user",
});

// Per-IP: 防 password spraying / 帳號鎖定 DoS
const loginIpRateLimit = new Ratelimit({
  redis: globalRedis,
  limiter: Ratelimit.slidingWindow(20, "15 m"),
  analytics: true,
  prefix: "ratelimit:login:ip",
});

export const authConfig = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "帳號", type: "text" },
        password: { label: "密碼", type: "password" }
      },
      async authorize(credentials, request) {
        const username = credentials.username as string;

        // IP: prefer x-real-ip (set by Vercel), fall back to last x-forwarded-for entry
        const realIp = request?.headers?.get("x-real-ip");
        const forwarded = request?.headers?.get("x-forwarded-for");
        const ip =
          realIp?.trim() ??
          forwarded?.split(",").at(-1)?.trim() ??
          "127.0.0.1";

        // 1) Per-IP check first — blocks DoS / password spraying without locking real users
        const { success: ipOk } = await loginIpRateLimit.limit(ip);
        if (!ipOk) {
          throw new Error("此 IP 的嘗試次數過多，請稍後再試。");
        }

        // 2) Per-username check — locks a specific account after 5 wrong attempts
        const { success: userOk } = await loginUserRateLimit.limit(username);
        if (!userOk) {
          throw new Error("嘗試次數過多，帳號已被暫時鎖定，請 15 分鐘後再試。");
        }

        const user = await db.user.findUnique({
          where: { username },
        });

        if (!user) {
          throw new Error("帳號或密碼錯誤");
        }

        const isValid = await compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) {
          throw new Error("帳號或密碼錯誤");
        }

        return { 
          id: user.id, 
          name: user.username, 
          image: user.avatar
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) token.id = user.id;
      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.id as string,
      },
    }),
  },
} satisfies NextAuthConfig;
