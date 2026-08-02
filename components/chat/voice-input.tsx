'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Dictado por voz.
 *
 * Dos caminos, y el primero que esté disponible gana:
 *
 *   1. **Web Speech API.** Transcribe en el propio dispositivo, sin subir
 *      nada y sin costo. Es lo que hay en Chrome Android y en Safari iOS.
 *   2. **Grabación y transcripción en servidor.** Donde no exista la API, se
 *      graba con `MediaRecorder` y el audio se adjunta al mensaje: Gemini lo
 *      transcribe al leerlo. Se avisa a la persona de la diferencia, porque
 *      en este camino su voz sí sale del dispositivo.
 *
 * Nunca se activa solo. Empieza y termina cuando la persona lo dice.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
};

type RecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate =
    (window as unknown as { SpeechRecognition?: RecognitionConstructor })
      .SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: RecognitionConstructor })
      .webkitSpeechRecognition;
  return candidate ?? null;
}

type VoiceInputProps = {
  /** Recibe el texto reconocido para añadirlo a lo ya escrito. */
  onTranscript: (text: string) => void;
  /** Respaldo: el audio grabado se adjunta y lo transcribe el modelo. */
  onRecording: (file: File) => void;
  disabled?: boolean;
};

export function VoiceInput({
  onTranscript,
  onRecording,
  disabled = false,
}: VoiceInputProps) {
  const [supported, setSupported] = useState<'speech' | 'record' | 'none'>('none');
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (getRecognitionConstructor()) {
      setSupported('speech');
      return;
    }
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
    ) {
      setSupported('record');
      return;
    }
    setSupported('none');
  }, []);

  // Si el componente desaparece a media grabación, se corta todo.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recorderRef.current?.stop();
    };
  }, []);

  function startSpeech() {
    const Constructor = getRecognitionConstructor();
    if (!Constructor) return;

    const recognition = new Constructor();
    recognition.lang = 'es-MX';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      let text = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) text += result[0]?.transcript ?? '';
      }
      if (text.trim()) onTranscript(text.trim());
    };

    recognition.onerror = () => {
      setStatus('No se pudo escuchar. Revisa el permiso del micrófono.');
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setStatus('Escuchando. Habla con calma.');
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
        onRecording(new File([blob], `nota-de-voz.${extension}`, { type: blob.type }));
        setStatus('Audio adjuntado. CIAN lo escuchará al responder.');
      };

      recorderRef.current = recorder;
      recorder.start();
      setListening(true);
      setStatus('Grabando. Tu voz se enviará a CIAN para transcribirla.');
    } catch {
      setStatus('No pudimos usar el micrófono. Revisa el permiso.');
      setListening(false);
    }
  }

  function stop() {
    recognitionRef.current?.stop();
    recorderRef.current?.stop();
    setListening(false);
    if (supported === 'speech') setStatus('');
  }

  if (supported === 'none') return null;

  return (
    <>
      <Button
        type="button"
        variant={listening ? 'danger' : 'outline'}
        size="icon"
        disabled={disabled}
        aria-label={listening ? 'Dejar de dictar' : 'Dictar por voz'}
        aria-pressed={listening}
        onClick={() => {
          if (listening) {
            stop();
            return;
          }
          if (supported === 'speech') startSpeech();
          else void startRecording();
        }}
      >
        {listening ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
      </Button>

      {status ? (
        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>
      ) : null}
    </>
  );
}
