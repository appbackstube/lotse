import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { idleVoice, RealtimeConversation, type VoiceDelegation, type VoiceReply, type VoiceSnapshot } from "./conversation";
import { conversationVoice, conversationVoiceKey } from "./conversationVoices";
import { fileStore } from "./fileStore";
import { watchConversationPlayback } from "./conversationPlayback";
import { processMicrophone } from "./conversationNoise";
import type { ChatMessage } from "./types";

export function useConversation({ available, context, messages, running, blocked, replies, onSend }: {
  available: boolean; context: string; running: boolean; blocked: boolean;
  messages: ChatMessage[];
  replies: VoiceReply[]; onSend: (request: VoiceDelegation) => Promise<boolean>;
}) {
  const [snapshot, setSnapshot] = useState<VoiceSnapshot>(idleVoice);
  const spokenIds = useRef(new Set(replies.map(reply => reply.id)));
  const session = useRef<RealtimeConversation | null>(null);
  const onSendRef = useRef(onSend);
  const workingRef = useRef({ running, blocked });
  useEffect(() => { onSendRef.current = onSend; }, [onSend]);
  useEffect(() => {
    workingRef.current = { running, blocked };
    session.current?.setWorking(running, blocked);
  }, [running, blocked]);
  useEffect(() => {
    if (!available) return;
    const voice = new RealtimeConversation({
      microphone: () => {
        if (!navigator.mediaDevices?.getUserMedia) return Promise.reject("Microphone access is not available in this window.");
        return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      },
      peer: () => new RTCPeerConnection(),
      processMicrophone,
      audio: () => new Audio(),
      watchPlayback: watchConversationPlayback,
      connect: sdp => invoke<string>("start_conversation", { sdp, voice: conversationVoice(fileStore.getItem(conversationVoiceKey)) }),
      delegate: request => onSendRef.current({ ...request, workspaceKey: context }),
      changed: setSnapshot,
    });
    voice.setWorking(workingRef.current.running, workingRef.current.blocked);
    session.current = voice;
    return () => { voice.stop(); session.current = null; };
  }, [available, context]);
  useEffect(() => { session.current?.setHistory(messages); }, [messages, available, context]);
  useEffect(() => {
    for (const reply of replies) {
      if (spokenIds.current.has(reply.id)) continue;
      spokenIds.current.add(reply.id);
      if (reply.context === context) session.current?.deliver(reply);
    }
    spokenIds.current = new Set(replies.map(reply => reply.id));
  }, [replies, context]);
  return {
    ...snapshot,
    active: snapshot.phase !== "idle",
    start: () => { void session.current?.start(); },
    stop: () => session.current?.stop(),
    mute: () => session.current?.setMuted(!snapshot.muted),
    interrupt: () => session.current?.interrupt(),
    resumeAudio: () => session.current?.resumeAudio(),
  };
}
