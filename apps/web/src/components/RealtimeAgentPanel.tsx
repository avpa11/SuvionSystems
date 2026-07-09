"use client";

import { useRef, useState } from "react";

interface RealtimeStatus {
  configured: boolean;
  enabled: boolean;
  status: "disabled" | "not_configured" | "ready";
  model: string;
  voice: string;
  knowledgeDomains: string[];
  message?: string;
}

interface RealtimeAgentPanelProps {
  apiHost: string;
  status: RealtimeStatus | null;
  onStatusMessage: (message: string) => void;
}

export function RealtimeAgentPanel({ apiHost, status, onStatusMessage }: RealtimeAgentPanelProps) {
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function stop() {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
    setConnecting(false);
    onStatusMessage("Realtime agent disconnected.");
  }

  async function start() {
    if (!status || status.status !== "ready") {
      onStatusMessage(status?.message ?? "Realtime agent is not ready.");
      return;
    }

    setConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (!audioRef.current) return;
        audioRef.current.srcObject = event.streams[0];
      };

      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
      pc.createDataChannel("oai-events");

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
      onStatusMessage("Realtime maritime agent is live.");
    } catch (err) {
      await stop();
      onStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="realtime-agent">
      <audio ref={audioRef} autoPlay />
      <div className="realtime-agent__meta">
        <span>{status?.model ?? "model pending"}</span>
        <span>{status?.voice ?? "voice pending"}</span>
      </div>
      <div className="realtime-agent__domains">
        {(status?.knowledgeDomains ?? []).slice(0, 4).map((domain) => (
          <span key={domain}>{domain}</span>
        ))}
      </div>
      <div className="realtime-agent__actions">
        <button type="button" onClick={active ? stop : start} disabled={connecting || status?.status !== "ready"}>
          {active ? "Stop voice" : connecting ? "Connecting" : "Start voice"}
        </button>
      </div>
    </div>
  );
}
