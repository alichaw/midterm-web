import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const aiRouter = createTRPCRouter({
  rewriteText: publicProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error("伺服器未設定 Gemini API Key");
        }

        // 呼叫 Gemini 1.5 Flash 模型
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `請將以下文字改寫成更流暢、更有趣的版本，保持原意但用詞更生動：\n\n${input.text}`,
                    },
                  ],
                },
              ],
            }),
          }
        );

        if (!res.ok) {
          const errorData = await res.json();
          console.error("Gemini API Error:", errorData);
          throw new Error("Gemini API 請求失敗");
        }

        const data = await res.json();
        // 根據 Gemini API 的回應格式解析出文字
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!generatedText) {
          throw new Error("無法解析 AI 回應");
        }

        return generatedText;
      } catch (error) {
        console.error(error);
        throw new Error("AI 服務暫時無法使用，請稍後再試。");
      }
    }),
});