import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

type Summary = { baseUrl: string; hasUsername: boolean; hasEmail: boolean; hasPassword: boolean };
type Draft = { baseUrl: string; previousBaseUrl?: string; username?: string; email?: string; password?: string };

export function WebsiteCredentialsSettings() {
  const [entries, setEntries] = useState<Summary[]>([]);
  const [draft, setDraft] = useState<Draft>({ baseUrl: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    void invoke<Summary[]>("list_website_credentials").then((entries) => { if (active) setEntries(entries); })
      .catch(() => { if (active) setError("Website Keychain is unavailable. Unlock your login Keychain and retry."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  const save = async () => {
    setBusy(true); setError("");
    try {
      setEntries(await invoke<Summary[]>("save_website_credential", { credential: draft }));
      setDraft({ baseUrl: "" });
    } catch { setError("Could not save. Use an exact HTTPS base URL, a username or email, and a password. Check Keychain access and duplicate websites."); }
    finally { setBusy(false); }
  };
  const remove = async (baseUrl: string) => {
    setBusy(true); setError("");
    try {
      setEntries(await invoke<Summary[]>("delete_website_credential", { baseUrl }));
      if (draft.previousBaseUrl === baseUrl) setDraft({ baseUrl: "" });
    } catch { setError("Could not delete the website credential. Unlock your login Keychain and retry."); }
    finally { setBusy(false); }
  };
  return <section className="mt-10" aria-labelledby="website-credentials-title">
    <h2 id="website-credentials-title" className="mb-4 text-[17px] font-semibold text-[#E8FFF0]">Website credentials</h2>
    <div className="space-y-4 rounded-xl border border-[#294536] bg-[#111A15] p-5">
      <p className="text-sm text-[#7C9B88]">Stored in macOS Keychain. Agents can discover and fill logins without reading values. One login per exact HTTPS origin; subdomains and ports are separate. Only save websites you trust with these credentials.</p>
      {error && <p role="alert" className="text-sm text-[#FB7185]">{error}</p>}
      {entries.length > 0 && <ul className="space-y-2" aria-label="Saved website credentials">
        {entries.map((entry) => <li key={entry.baseUrl} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-[#294536] bg-[#0B110E] p-3">
          <div className="min-w-0 flex-1"><p className="break-all text-sm text-[#E8FFF0]">{entry.baseUrl}</p><p className="text-xs text-[#7C9B88]">{[entry.hasUsername && "Username stored", entry.hasEmail && "Email stored", entry.hasPassword && "Password stored"].filter(Boolean).join(" · ")}</p></div>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => { setError(""); setDraft({ baseUrl: entry.baseUrl, previousBaseUrl: entry.baseUrl }); }} aria-label={`Edit login for ${entry.baseUrl}`}>Edit</Button><Button variant="ghost" size="sm" className="text-[#FB7185]" disabled={busy} onClick={() => void remove(entry.baseUrl)} aria-label={`Delete login for ${entry.baseUrl}`}>Delete</Button></div>
        </li>)}
      </ul>}
      <form autoComplete="off" onSubmit={(event) => { event.preventDefault(); void save(); }} aria-label="Website credential editor">
        <h3 className="mb-3 text-sm font-semibold text-[#E8FFF0]">{draft.previousBaseUrl ? "Edit website login" : "Add website login"}</h3>
        {draft.previousBaseUrl && <p className="mb-3 text-xs text-[#7C9B88]">Saved values are never read back. Untouched fields keep their saved value. To clear a username or email, edit that field and leave it empty.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-[#E8FFF0]">Base URL<Input required value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.currentTarget.value })} placeholder="https://example.com" aria-label="Website base URL" disabled={busy} className="h-9 border-[#294536] bg-[#050807]" /></label>
          {(["username", "email", "password"] as const).map((field) => <label key={field} className="grid gap-2 text-sm capitalize text-[#E8FFF0]">{field}<Input type="password" autoComplete="new-password" spellCheck={false} value={draft[field] ?? ""} onChange={(event) => setDraft({ ...draft, [field]: event.currentTarget.value })} placeholder={draft.previousBaseUrl ? "Unchanged until edited" : ""} aria-label={`Website ${field}`} disabled={busy} className="h-9 border-[#294536] bg-[#050807]" /></label>)}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => { setDraft({ baseUrl: "" }); setError(""); }}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Working…" : "Save website login"}</Button></div>
      </form>
      <p className="text-xs text-[#7C9B88]">Agents can read and use websites after login. Saved login values are hidden from page snapshots. Screenshots may be unavailable to protect visible login details. Deleting a credential does not sign out existing website sessions.</p>
    </div>
  </section>;
}
