import { type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "~/server/db";

export const authConfig = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "帳號", type: "text" },
        password: { label: "密碼", type: "password" }
      },
      async authorize(credentials) {
        const user = await db.user.findUnique({
          where: { username: credentials.username as string },
        });

        if (!user) throw new Error("找不到此使用者");

        const isValid = await compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) throw new Error("密碼錯誤");

        // ✅ 修正：回傳符合 NextAuth User 格式的物件
        return { id: user.id, name: user.username, email: user.email ?? "" };
      },
    }),
  ],
  // ✅ 移除 adapter — JWT strategy 與 PrismaAdapter 同時用會衝突
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