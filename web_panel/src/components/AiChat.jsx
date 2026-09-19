import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Loader2, Bot, User as UserIcon } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const AiChat = ({ role = "customer", title = "AzoApp AI Assistant", hint }) => {
  const [msgs, setMsgs] = useState([
    { role: "assistant", text: hint || "Hello! Please describe your home service issue, and I'll suggest the right service and an estimated price. 😊" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const send = async () => {
    if (!input.trim() || busy) return;
    const q = input.trim();
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const { data } = await api.post("/ai/chat", { message: q, ...(session ? { session_id: session } : {}) });
      setSession(data.session_id);
      setMsgs((m) => [...m, { role: "assistant", text: data.reply }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Sorry, the AI is currently unavailable. Please try again in a little while." }]);
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col h-[460px] rounded-xl border border-slate-200 bg-white overflow-hidden" data-testid="ai-chat">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-primary-50">
        <Sparkles className="h-4 w-4 text-primary-700" strokeWidth={1.5} />
        <span className="font-semibold text-sm text-primary-800">{title}</span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-primary-600 bg-white px-2 py-0.5 rounded-full">Claude</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-slate-200" : "bg-primary-700"}`}>
              {m.role === "user" ? <UserIcon className="h-4 w-4 text-slate-600" /> : <Bot className="h-4 w-4 text-white" />}
            </div>
            <div className={`text-sm px-3 py-2 rounded-2xl max-w-[80%] whitespace-pre-wrap ${m.role === "user" ? "bg-primary-700 text-white rounded-tr-sm" : "bg-slate-100 text-slate-700 rounded-tl-sm"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="flex gap-2"><div className="h-7 w-7 rounded-full bg-primary-700 flex items-center justify-center"><Bot className="h-4 w-4 text-white" /></div><div className="bg-slate-100 px-3 py-2 rounded-2xl"><Loader2 className="h-4 w-4 animate-spin text-primary-700" /></div></div>}
        <div ref={endRef} />
      </div>
      <div className="p-3 border-t border-slate-100 flex gap-2">
        <Input data-testid="ai-chat-input" placeholder="Type your problem..." value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <Button data-testid="ai-chat-send" onClick={send} disabled={busy} className="bg-primary-700 hover:bg-primary-800 px-3">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
