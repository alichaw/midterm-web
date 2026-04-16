"use client";
import { useState, useRef } from "react";
import { api } from "~/trpc/react";
import { signIn, signOut, useSession } from "next-auth/react";

export default function HomePage() {
  const { data: session } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"register" | "login">("register");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [aiInput, setAiInput] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = api.useUtils();

  const register = api.user.register.useMutation({
    onSuccess: () => {
      alert("註冊成功！請直接登入");
      setActiveTab("login"); // 註冊成功後自動切換到登入 tab
      setPassword(""); // 清空密碼，讓使用者重輸或保留帳號
    },
    onError: (e) => alert(e.message),
  });

  const postMsg = api.user.createMessage.useMutation({
    onSuccess: () => {
      setMsg("");
      void utils.user.getMessages.invalidate();
    },
    onError: (err) => {
      if (err.data?.code === "UNAUTHORIZED") alert("請先登入才能留言！");
      else alert(err.message);
    },
  });

  const deleteMsg = api.user.deleteMessage.useMutation({
    onSuccess: () => void utils.user.getMessages.invalidate(),
  });

  const uploadAvatar = api.user.uploadAvatar.useMutation({
    onSuccess: () => {
      alert("頭貼上傳成功！");
      setAvatarPreview(null);
      setAvatarBase64(null);
      void utils.user.getMessages.invalidate();
    },
    onError: (e) => alert(e.message),
  });

  const rewriteText = api.ai.rewriteText.useMutation({
    onSuccess: (data) => {
      setAiOutput(data);
      setAiLoading(false);
    },
    onError: (err) => {
      setAiOutput(`發生錯誤：${err.message}`);
      setAiLoading(false);
    },
  });

  const { data: messages } = api.user.getMessages.useQuery();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      alert("僅支援 JPG 或 PNG 格式");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setAvatarPreview(result);
      setAvatarBase64(result);
    };
    reader.readAsDataURL(file);
  };

  const handleAiRewrite = () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiOutput("");
    
    // 透過 tRPC 將文字送給後端，由後端去呼叫 Gemini
    rewriteText.mutate({ text: aiInput });
  };

  // 處理自訂表單登入
  const handleLogin = async () => {
    if (!username || !password) {
      alert("請輸入帳號與密碼");
      return;
    }
    setIsLoggingIn(true);
    try {
      const res = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false, // 設為 false 以免跳轉，留在原頁面處理結果
      });

      if (res?.error) {
        alert("登入失敗，請檢查帳號或密碼是否正確");
      } else if (res?.ok) {
        // 登入成功，強制重新整理頁面讓 Session 更新
        window.location.reload();
      }
    } catch (error) {
      alert("登入發生錯誤，請稍後再試");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      {/* ── 頂部導覽列 ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="text-xl font-bold text-indigo-600 tracking-wide">
            MySpace.
          </span>
          {session ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                歡迎，<strong className="text-gray-900">{session.user?.name}</strong>
              </span>
              <button
                onClick={() => void signOut()}
                className="text-sm px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
              >
                登出
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-500 font-medium">請先登入或註冊</div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* ── 個人介紹區 (Hero Section) ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8 flex flex-col md:flex-row items-center md:items-start gap-8">
          <div className="shrink-0">
            <div className="w-28 h-28 rounded-full bg-indigo-100 border-4 border-white shadow-lg flex items-center justify-center text-4xl overflow-hidden">
              🧑‍💻
            </div>
          </div>
          <div className="text-center md:text-left flex-1">
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2">
              你好，我是網站主人 👋 (testing)
            </h1>
            <p className="text-gray-600 leading-relaxed max-w-2xl">
              這是一個用於期中攻防演練的個人網站，歡迎來訪！我熱愛程式開發與資安研究。本站使用 Next.js + tRPC + Prisma 建構。大家可以自由註冊帳號、上傳頭貼，並在下方的留言板留下你的足跡。
            </p>
          </div>
        </section>

        {/* ── 主要內容雙欄排版 ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* 左側：主功能 (留言板、AI 功能) */}
          <div className="lg:col-span-2 space-y-8">
            {/* 留言板區塊 (不變) */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                💬 留言板
              </h2>
              <div className="mb-8">
                {session ? (
                  <div className="flex gap-3">
                    <input
                      value={msg}
                      onChange={(e) => setMsg(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && postMsg.mutate({ content: msg })}
                      placeholder="分享一下你的想法..."
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                    />
                    <button
                      onClick={() => postMsg.mutate({ content: msg })}
                      disabled={postMsg.isPending || !msg.trim()}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors whitespace-nowrap shadow-sm"
                    >
                      送出
                    </button>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-gray-500 text-sm">
                    🔒 請先登入或註冊才能參與留言
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {messages?.length === 0 && (
                  <p className="text-center text-gray-400 py-8">目前還沒有留言，來當第一個吧！</p>
                )}
                {messages?.map((m) => (
                  <div key={m.id} className="flex gap-4 items-start p-4 hover:bg-gray-50 rounded-xl transition-colors group">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 border border-gray-200 flex shrink-0 items-center justify-center overflow-hidden">
                      {m.user?.avatar ? (
                        <img
                          src={
                            m.user.avatar.startsWith("https://res.cloudinary.com/")
                              ? m.user.avatar
                              : undefined
                          }
                          alt="avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-lg">👤</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="font-semibold text-gray-900 text-sm">{m.user.username}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">
                            {new Date(m.createdAt).toLocaleString("zh-TW", { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                          </span>
                          {session?.user?.id === m.userId && (
                            <button onClick={() => deleteMsg.mutate({ id: m.id })} className="text-xs text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:underline">
                              刪除
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* AI 文字改寫區塊 (不變) */}
            <section className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-sm border border-indigo-100 p-6">
              <h2 className="text-lg font-bold text-indigo-900 mb-2 flex items-center gap-2">
                ✨ AI 小幫手：文字改寫
              </h2>
              <p className="text-indigo-700/80 text-sm mb-4">輸入草稿，讓 Claude AI 幫你修飾得更通順生動。</p>
              <textarea
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="輸入想要改寫的文字..."
                rows={3}
                className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3 resize-y"
              />
              <button
                onClick={() => void handleAiRewrite()}
                disabled={aiLoading || !aiInput.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white font-medium rounded-xl transition-all shadow-sm"
              >
                {aiLoading ? "AI 正在思考中..." : "開始改寫"}
              </button>
              {aiOutput && (
                <div className="mt-4 p-4 bg-white/80 backdrop-blur border border-indigo-100 rounded-xl">
                  <p className="text-xs font-bold text-purple-600 mb-2 uppercase tracking-wider">改寫結果</p>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{aiOutput}</p>
                </div>
              )}
            </section>
          </div>

          {/* 右側：側邊欄 (會員登入 / 頭貼上傳) */}
          <div className="space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 overflow-hidden">
              {!session ? (
                <>
                  {/* 分頁切換 */}
                  <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
                    {(["register", "login"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                          activeTab === tab
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {tab === "register" ? "註冊新帳號" : "現有帳號登入"}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">帳號</label>
                      <input
                        value={username}
                        placeholder={activeTab === "register" ? "至少 3 個字元" : "請輸入帳號"}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">密碼</label>
                      <input
                        type="password"
                        value={password}
                        placeholder={activeTab === "register" ? "至少 6 個字元" : "請輸入密碼"}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                           if (e.key === "Enter") {
                             if (activeTab === "login") void handleLogin();
                             else register.mutate({ username: username.trim(), password });
                           }
                        }}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {activeTab === "register" ? (
                      <button
                        onClick={() => register.mutate({ username, password })}
                        disabled={register.isPending}
                        className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors mt-2"
                      >
                        {register.isPending ? "註冊中..." : "註冊"}
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleLogin()}
                        disabled={isLoggingIn}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors mt-2 shadow-sm"
                      >
                        {isLoggingIn ? "登入中..." : "登入"}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <h3 className="font-bold text-gray-900 mb-1">個人設定</h3>
                  <p className="text-sm text-gray-500 mb-6">管理您的個人檔案與資訊</p>
                  
                  {/* 頭貼上傳 */}
                  <div className="flex flex-col items-center gap-4 border-t border-gray-100 pt-6">
                    <p className="text-sm font-medium text-gray-700">更新顯示頭貼</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="group relative w-24 h-24 rounded-full border-2 border-dashed border-gray-300 hover:border-indigo-400 flex items-center justify-center bg-gray-50 cursor-pointer overflow-hidden transition-all"
                    >
                      {avatarPreview ? (
                        <img 
                          src={avatarPreview} 
                          alt="preview" 
                          className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" 
                        />
                      ) : (
                        <span className="text-gray-400 group-hover:text-indigo-500 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </span>
                      )}
                    </button>
                    <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" />
                    
                    {avatarPreview && (
                      <button
                        onClick={() => avatarBase64 && uploadAvatar.mutate({ imageBase64: avatarBase64 })}
                        disabled={uploadAvatar.isPending}
                        className="w-full py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 text-sm font-medium rounded-lg transition-colors"
                      >
                        {uploadAvatar.isPending ? "上傳中..." : "確認上傳"}
                      </button>
                    )}
                    <p className="text-xs text-gray-400">支援 JPG 或 PNG 格式圖片</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
