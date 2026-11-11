import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Pause, Play, RotateCcw, Settings, SkipForward, Timer } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "./ui/popover";
import { createPomodoro, formatPomodoroTime, normalizePomodoroSettings, pomodoroLabels, pomodoroRemaining, updatePomodoro, type PomodoroAction, type PomodoroSettings as TimerSettings, type PomodoroTimerState } from "../pomodoro";

const PomodoroContext = createContext<{ settings: TimerSettings; timer: PomodoroTimerState; now: number; notice: string; act: (action: PomodoroAction) => void } | null>(null);

export function PomodoroProvider({ settings, revision, onComplete, children }: {
  settings: TimerSettings; revision: number; onComplete: (body: string) => void; children: ReactNode;
}) {
  // shortcut: timer state lasts for this app session; persist it when restart recovery is needed.
  const [timer, setTimer] = useState(() => createPomodoro(settings));
  const [now, setNow] = useState(Date.now);
  const [notice, setNotice] = useState("");
  const [timerRevision, setTimerRevision] = useState(revision);

  if (timerRevision !== revision) {
    setTimerRevision(revision);
    setTimer(createPomodoro(settings));
    setNow(Date.now());
    setNotice("");
  }

  const act = (action: PomodoroAction) => {
    const currentTime = Date.now();
    const next = updatePomodoro(timer, action, settings, currentTime);
    setNow(currentTime);
    setTimer(next);
    if (action === "pause" && next.phase !== timer.phase) {
      const body = `${pomodoroLabels[timer.phase]} complete. ${pomodoroLabels[next.phase]} is ready.`;
      setNotice(body);
      onComplete(body);
    } else setNotice("");
  };

  useEffect(() => {
    if (timer.endsAt === null) return;
    let finished = false;
    const tick = () => {
      if (finished) return;
      const currentTime = Date.now();
      setNow(currentTime);
      const next = updatePomodoro(timer, "tick", settings, currentTime);
      if (next !== timer) {
        finished = true;
        setTimer(next);
        const body = `${pomodoroLabels[timer.phase]} complete. ${pomodoroLabels[next.phase]} is ready.`;
        setNotice(body);
        onComplete(body);
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [timer, settings, onComplete]);

  return <PomodoroContext.Provider value={{ settings, timer, now, notice, act }}>{children}</PomodoroContext.Provider>;
}

export function PomodoroTimer({ onSettings }: { onSettings: () => void }) {
  const pomodoro = useContext(PomodoroContext);
  const [open, setOpen] = useState(false);
  if (!pomodoro) throw new Error("PomodoroTimer requires PomodoroProvider");
  const { settings, timer, now, notice, act } = pomodoro;
  const running = timer.endsAt !== null;
  const time = formatPomodoroTime(pomodoroRemaining(timer, now));

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger className="top-button github-inbox-trigger pomodoro-trigger" aria-label={`Pomodoro timer: ${pomodoroLabels[timer.phase]}, ${time}${running ? ", running" : ""}`} title="Pomodoro timer">
      <Timer size={15} />{(running || notice || timer.remainingMs !== settings[timer.phase] * 60_000) && <span className="pomodoro-toolbar-time">{time}</span>}{notice && <span className="pomodoro-ready-dot" aria-hidden="true" />}
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} className="pomodoro-popover">
      <header className="flex items-center justify-between gap-3"><PopoverTitle>Pomodoro</PopoverTitle><Button variant="ghost" size="icon-sm" aria-label="Pomodoro settings" title="Pomodoro settings" onClick={() => { setOpen(false); onSettings(); }}><Settings size={14} /></Button></header>
      <p className="pomodoro-phase">{pomodoroLabels[timer.phase]}</p>
      <div className="pomodoro-countdown" role="timer" aria-label={`${pomodoroLabels[timer.phase]} time remaining`}>{time}</div>
      <p className="pomodoro-progress">{timer.completed} focus {timer.completed === 1 ? "session" : "sessions"} completed</p>
      <p className="pomodoro-notice" role="status">{notice || (running ? "Timer running" : "Ready when you are")}</p>
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Reset Pomodoro phase" title="Reset phase" onClick={() => act("reset")}><RotateCcw size={15} /></Button>
        <Button onClick={() => act(running ? "pause" : "start")} aria-label={running ? "Pause Pomodoro" : "Start Pomodoro"}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? "Pause" : "Start"}</Button>
        <Button variant="ghost" size="icon" aria-label="Skip Pomodoro phase" title="Skip phase" onClick={() => act("skip")}><SkipForward size={15} /></Button>
      </div>
      <p className="pomodoro-hint">Start each phase when you’re ready. Runs while the app is open.</p>
    </PopoverContent>
  </Popover>;
}

export function PomodoroSettings({ settings, onSave }: { settings: TimerSettings; onSave: (settings: TimerSettings) => void }) {
  const [saved, setSaved] = useState(false);
  return <section className="mt-10" aria-labelledby="pomodoro-settings-title">
    <h2 id="pomodoro-settings-title" className="mb-4 text-[17px] font-semibold text-[#E8FFF0]">Pomodoro</h2>
    <form key={JSON.stringify(settings)} className="rounded-xl border border-[#294536] bg-[#111A15] p-5" onChange={() => setSaved(false)} onSubmit={(event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      const data = new FormData(event.currentTarget);
      onSave(normalizePomodoroSettings(Object.fromEntries([...data].map(([key, value]) => [key, Number(value)]))));
      setSaved(true);
    }}>
      <p className="mb-4 text-sm text-[#7C9B88]">Saved on this device. Saving restarts the timer with a fresh focus session.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {([ ["focus", "Focus (minutes)"], ["shortBreak", "Short break (minutes)"], ["longBreak", "Long break (minutes)"], ["sessionsBeforeLongBreak", "Focus sessions before long break"] ] as const).map(([key, label]) => <label key={key} className="grid gap-2 text-sm text-[#E8FFF0]">{label}<Input name={key} type="number" required min={1} max={key === "sessionsBeforeLongBreak" ? 12 : 180} step={1} defaultValue={settings[key]} className="h-9 border-[#294536] bg-[#050807]" /></label>)}
      </div>
      <div className="mt-4 flex items-center justify-end gap-3"><span role="status" className="text-sm text-[#7C9B88]">{saved ? "Saved" : ""}</span><Button type="submit">Save Pomodoro settings</Button></div>
    </form>
  </section>;
}
