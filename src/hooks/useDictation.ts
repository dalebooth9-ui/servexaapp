import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web Speech API dictation ("talk to type").
 * - en-GB, continuous, interim results
 * - reports final + interim text via callbacks
 * - silently unsupported on browsers without SpeechRecognition
 */

type SpeechRecognitionLike = any;

export function getSpeechRecognition(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export const dictationSupported = () => !!getSpeechRecognition();

const MIC_NOTE_KEY = "dictation_mic_denied_noted";

/** Light sentence-start capitalisation; engineers tidy in review. */
export function tidyDictated(text: string, precedingText: string): string {
  let t = text.trim();
  if (!t) return "";
  const prev = precedingText.replace(/\s+$/, "");
  const atSentenceStart = !prev || /[.!?]$/.test(prev);
  if (atSentenceStart) t = t.charAt(0).toUpperCase() + t.slice(1);
  // tidy spacing before punctuation produced by spoken punctuation
  t = t.replace(/\s+([,.;:!?])/g, "$1");
  return t;
}

export interface UseDictationOptions {
  /** called with each finalised chunk of speech */
  onFinal: (text: string) => void;
  /** called with the live (not yet final) text */
  onInterim?: (text: string) => void;
  onError?: (message: string) => void;
}

export function useDictation({ onFinal, onInterim, onError }: UseDictationOptions) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const manualStop = useRef(false);
  const cb = useRef({ onFinal, onInterim, onError });
  cb.current = { onFinal, onInterim, onError };

  const supported = dictationSupported();

  const stop = useCallback(() => {
    manualStop.current = true;
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
    setInterim("");
  }, []);

  useEffect(() => () => {
    try {
      recRef.current?.abort?.();
    } catch {
      /* noop */
    }
  }, []);

  const start = useCallback(async () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;

    // Ask for the microphone up front so we can explain / handle denial nicely.
    try {
      const stream = await navigator.mediaDevices?.getUserMedia?.({ audio: true });
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      if (!localStorage.getItem(MIC_NOTE_KEY)) {
        localStorage.setItem(MIC_NOTE_KEY, "1");
        cb.current.onError?.(
          "Microphone access is blocked. You can still use the microphone key on your device keyboard to dictate.",
        );
      } else {
        cb.current.onError?.("Microphone access is blocked.");
      }
      return;
    }

    const rec: SpeechRecognitionLike = new Ctor();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event: any) => {
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) cb.current.onFinal(text);
        else live += text;
      }
      setInterim(live);
      cb.current.onInterim?.(live);
    };

    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        cb.current.onError?.(
          "Microphone access is blocked. You can still use the microphone key on your device keyboard to dictate.",
        );
      } else if (e?.error !== "no-speech" && e?.error !== "aborted") {
        cb.current.onError?.("Voice input stopped unexpectedly. Please try again.");
      }
      setListening(false);
      setInterim("");
    };

    rec.onend = () => {
      setInterim("");
      // Chrome ends the session periodically — restart unless the user stopped it.
      if (!manualStop.current) {
        try {
          rec.start();
          return;
        } catch {
          /* noop */
        }
      }
      setListening(false);
    };

    manualStop.current = false;
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      cb.current.onError?.("Could not start voice input.");
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else void start();
  }, [listening, start, stop]);

  return { supported, listening, interim, start, stop, toggle };
}
