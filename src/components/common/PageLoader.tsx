export default function PageLoader() {
  return (
    <main
      className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-6"
      role="status"
      aria-live="polite"
      aria-label="Loading VoiceID"
    >
      <div className="w-full max-w-xs rounded-[2rem] bg-white/90 p-8 text-center shadow-2xl shadow-indigo-100 ring-1 ring-indigo-100 backdrop-blur">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-5xl shadow-xl shadow-indigo-200" aria-hidden="true">🤖</div>
        <h1 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900">VoiceID तैयार हो रहा है…</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Robot अभी अपनी छोटी सी चाय पी रहा है ☕</p>
        <div className="mt-5 flex justify-center gap-2">
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.3s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-indigo-600 [animation-delay:-0.15s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-600" />
        </div>
        <p className="mt-4 text-xs font-semibold text-indigo-500">Good things take a moment 💜</p>
      </div>
    </main>
  );
}
