"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Loader2, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";

export interface RealtimeStatus {
  configured: boolean;
  enabled: boolean;
  status: "disabled" | "not_configured" | "ready";
  model: string;
  voice: string;
  knowledgeDomains: string[];
  message?: string;
}

export interface RealtimeAgentPanelHandle {
  isActive: () => boolean;
  sendTextMessage: (text: string) => boolean;
}

interface RealtimeAgentPanelProps {
  apiHost: string;
  status: RealtimeStatus | null;
  onStatusMessage: (message: string) => void;
  onTranscript?: (role: "assistant" | "user", text: string) => void;
}

export const RealtimeAgentPanel = forwardRef<RealtimeAgentPanelHandle, RealtimeAgentPanelProps>(
  function RealtimeAgentPanel({ apiHost, status, onStatusMessage, onTranscript }, ref) {
    const [active, setActive] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [holdingToTalk, setHoldingToTalk] = useState(false);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const channelRef = useRef<RTCDataChannel | null>(null);
    const connectPromiseRef = useRef<Promise<boolean> | null>(null);
    const pushHeldRef = useRef(false);

    function sendEvent(event: Record<string, unknown>): boolean {
      const channel = channelRef.current;
      if (!channel || channel.readyState !== "open") return false;
      channel.send(JSON.stringify(event));
      return true;
    }

    function setMicrophoneEnabled(enabled: boolean) {
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
      setHoldingToTalk(enabled);
    }

    async function stop(statusMessage = "Realtime agent disconnected.") {
      pushHeldRef.current = false;
      setMicrophoneEnabled(false);
      channelRef.current?.close();
      channelRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (audioRef.current) audioRef.current.srcObject = null;
      setActive(false);
      setConnecting(false);
      onStatusMessage(statusMessage);
    }

    async function connect(): Promise<boolean> {
      if (pcRef.current) return true;

      if (!status || status.status !== "ready") {
        onStatusMessage(status?.message ?? "Realtime agent is not ready.");
        return false;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        onStatusMessage("This browser does not expose microphone capture.");
        return false;
      }

      setConnecting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
        streamRef.current = stream;

        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        pc.ontrack = (event) => {
          if (!audioRef.current) return;
          audioRef.current.srcObject = event.streams[0];
          audioRef.current.play().catch(() => {
            onStatusMessage("Voice output is ready; press the mic again if the browser blocks playback.");
          });
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            setMicrophoneEnabled(false);
            setActive(false);
          }
        };

        stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

        const channel = pc.createDataChannel("oai-events");
        channelRef.current = channel;
        channel.onopen = () => {
          onStatusMessage("Realtime voice is ready. Hold the mic while speaking.");
        };
        channel.onmessage = (event) => {
          const transcript = extractRealtimeTranscript(event.data);
          if (transcript) onTranscript?.(transcript.role, transcript.text);
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const response = await fetch(`${apiHost}/validation/realtime/calls`, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp ?? "",
        });

        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok || !contentType.includes("application/sdp")) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message ?? `Realtime session failed with HTTP ${response.status}.`);
        }

        const answerSdp = await response.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
        setActive(true);
        return true;
      } catch (err) {
        await stop(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setConnecting(false);
      }
    }

    async function ensureConnected(): Promise<boolean> {
      if (pcRef.current) return true;
      if (!connectPromiseRef.current) {
        connectPromiseRef.current = connect();
      }

      try {
        return await connectPromiseRef.current;
      } finally {
        connectPromiseRef.current = null;
      }
    }

    async function beginPushToTalk() {
      if (holdingToTalk || connecting) return;
      const connected = await ensureConnected();
      if (!connected || !pushHeldRef.current) return;
      setMicrophoneEnabled(true);
    }

    function startPushToTalk() {
      pushHeldRef.current = true;
      void beginPushToTalk();
    }

    function endPushToTalk() {
      pushHeldRef.current = false;
      if (!holdingToTalk) return;
      setMicrophoneEnabled(false);
      sendEvent({ type: "input_audio_buffer.commit" });
      sendEvent({
        type: "response.create",
        response: {
          modalities: ["text", "audio"],
        },
      });
    }

    function sendTextMessage(text: string): boolean {
      const trimmed = text.trim();
      if (!trimmed) return false;

      const created = sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: trimmed }],
        },
      });
      if (!created) return false;

      return sendEvent({
        type: "response.create",
        response: {
          modalities: ["text", "audio"],
        },
      });
    }

    useImperativeHandle(
      ref,
      () => ({
        isActive: () => active,
        sendTextMessage,
      }),
      [active]
    );

    const ready = status?.status === "ready";
    const voiceState = connecting ? "Connecting" : active ? (holdingToTalk ? "Listening" : "Voice ready") : "Hold mic to connect";

    return (
      <div className="realtime-agent">
        <audio ref={audioRef} autoPlay className="realtime-agent__audio" />
        <div className="realtime-agent__meta">
          <span>{status?.model ?? "model pending"}</span>
          <span>{status?.voice ?? "voice pending"}</span>
        </div>
        <div className={`realtime-agent__voice-state ${active ? "realtime-agent__voice-state--live" : ""}`}>
          <span>
            <Volume2 size={13} aria-hidden="true" />
            Speaker {active ? "live" : "idle"}
          </span>
          <span>{voiceState}</span>
        </div>
        <div className="realtime-agent__domains">
          {(status?.knowledgeDomains ?? []).slice(0, 4).map((domain) => (
            <span key={domain}>{domain}</span>
          ))}
        </div>
        <div className="realtime-agent__actions">
          <button
            type="button"
            className={`realtime-agent__ptt ${holdingToTalk ? "realtime-agent__ptt--holding" : ""}`}
            disabled={!ready || connecting}
            aria-label={holdingToTalk ? "Release to send voice message" : "Hold to talk to realtime agent"}
            title={holdingToTalk ? "Release to send" : "Hold to talk"}
            onPointerDown={(event) => {
              event.preventDefault();
              startPushToTalk();
            }}
            onPointerUp={endPushToTalk}
            onPointerCancel={endPushToTalk}
            onPointerLeave={endPushToTalk}
            onKeyDown={(event) => {
              if (event.repeat || (event.key !== " " && event.key !== "Enter")) return;
              event.preventDefault();
              startPushToTalk();
            }}
            onKeyUp={(event) => {
              if (event.key !== " " && event.key !== "Enter") return;
              event.preventDefault();
              endPushToTalk();
            }}
          >
            {connecting ? (
              <Loader2 size={24} aria-hidden="true" className="realtime-agent__spin" />
            ) : holdingToTalk ? (
              <Mic size={25} aria-hidden="true" />
            ) : (
              <MicOff size={25} aria-hidden="true" />
            )}
          </button>
          {active && (
            <button
              type="button"
              className="realtime-agent__disconnect"
              onClick={() => void stop()}
              aria-label="Disconnect realtime voice"
              title="Disconnect voice"
            >
              <PhoneOff size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  }
);

function extractRealtimeTranscript(raw: unknown): { role: "assistant" | "user"; text: string } | null {
  if (typeof raw !== "string") return null;

  try {
    const event = JSON.parse(raw) as Record<string, unknown>;
    const type = String(event.type ?? "");
    const transcript = typeof event.transcript === "string" ? event.transcript : "";
    const text = typeof event.text === "string" ? event.text : "";

    if (type === "conversation.item.input_audio_transcription.completed" && transcript.trim()) {
      return { role: "user", text: transcript.trim() };
    }

    if ((type === "response.audio_transcript.done" || type === "response.output_text.done") && (transcript || text)) {
      return { role: "assistant", text: (transcript || text).trim() };
    }
  } catch {
    return null;
  }

  return null;
}
