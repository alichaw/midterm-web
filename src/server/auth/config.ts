import { type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "~/server/db";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const loginRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  analytics: true,
  prefix: "ratelimit:login",
});

export const authConfig = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "帳號", type: "text" },
        password: { label: "密碼", type: "password" }
      },
      async authorize(credentials) {
        const username = credentials.username as string;

        const { success } = await loginRateLimit.limit(username);
        if (!success) {
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
