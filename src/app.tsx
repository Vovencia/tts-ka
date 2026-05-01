import clsx from 'clsx';
import styles from './app.module.scss';

import OpenAI from "openai";
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Params } from './Utils/Params';

const voices = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
] as readonly IVoice[];

type IVoice = (
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'sage'
  | 'shimmer'
  | 'verse'
  | 'marin'
  | 'cedar'
)

export function App() {
  const [, update] = useState(0);
  const [token, setToken] = useState(Params.Get("token") ?? "");

  const $voicesRef = useRef<HTMLSelectElement>(null);
  const $textRef = useRef<HTMLTextAreaElement>(null);
  const $instructionsRef = useRef<HTMLTextAreaElement>(null);

  const openai = useRef<OpenAI | null>(null);
  const isDownloading = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    Params.Set("token", token);
    openai.current = (new OpenAI({
      apiKey: token,
      baseURL: "https://api.proxyapi.ru/openai/v1",
      dangerouslyAllowBrowser: true,
    }));
    update(Date.now());
  }, [token]);

  const encodeCallback = useCallback(async () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    blobRef.current = null;
    audioRef.current = null;
    isDownloading.current = true;
    update(Date.now());

    if (!openai.current) {
      return;
    }

    const input = $textRef.current!.value;
    const instructions = $instructionsRef.current!.value;
    const voice = $voicesRef.current!.value;

    Params.Set("voice", voice as IVoice);

    const response = await openai.current.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice,
        input,
        instructions,
        response_format: "wav",
    });

    // 1. Получаем данные как Blob
    const blob = await response.blob();
    blobRef.current = blob;

    // 2. Создаем URL для Blob
    const audioUrl = URL.createObjectURL(blob);

    // 3. Создаем и запускаем аудио
    const audio = new Audio(audioUrl);

    // Освобождаем память после завершения воспроизведения
    audio.onended = () => update(Date.now());

    audioRef.current = audio;
    isDownloading.current = false;

    update(Date.now());
  }, []);

  const playCallback = useCallback(async () => {
    if (!audioRef.current) {
      return;
    }
    await audioRef.current.play();

    update(Date.now());
  }, []);
  const pauseCallback = useCallback(async () => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.pause();

    update(Date.now());
  }, []);
  const downloadCallback = useCallback(async () => {
    if (!blobRef.current) {
      return;
    }
    downloadBlob(blobRef.current, `${ $voicesRef.current!.value }.wav`);

    update(Date.now());
  }, []);

  const isButtonEncodeDisabled = isDownloading.current || !openai.current;
  const isButtonPlayDisabled = !audioRef.current || !audioRef.current.paused;
  const isButtonPauseDisabled = !audioRef.current || audioRef.current.paused;
  const isButtonDownloadDisabled = !blobRef.current;

  return (
    <div class={styles.app}>
      <nav class={clsx("navbar bg-primary", styles.header)} data-bs-theme="dark">
        <div class="container-fluid">
          <a class="navbar-brand" href="/">TTS-ka</a>
        </div>
      </nav>
      <div class={clsx("container", styles.controls)}>
        <div class={clsx(styles.controls__list)}>
            <div class={clsx(styles.control)}>
              <select ref={$voicesRef} class="form-select" aria-label="Default select example">
                { voices.map((voice) => (<option selected={ voice === Params.Get("voice") } value={voice}>{ voice }</option>)) }
              </select>
            </div>
            <div class={clsx(styles.control)}>
              <button type="button" class="btn btn-primary" disabled={isButtonEncodeDisabled} onClick={encodeCallback}>Преобразовать</button>
            </div>
            <div class={clsx(styles.control)} onClick={playCallback}>
              <button type="button" class="btn btn-success" disabled={isButtonPlayDisabled}><i class="bi bi-play-fill"></i></button>
            </div>
            <div class={clsx(styles.control)} onClick={pauseCallback}>
              <button type="button" class="btn btn-secondary" disabled={isButtonPauseDisabled}><i class="bi bi-pause-fill"></i></button>
            </div>
            <div class={clsx(styles.control)}>
              <button type="button" class="btn btn-dark" disabled={isButtonDownloadDisabled} onClick={downloadCallback}><i class="bi bi-download"></i></button>
            </div>
            <div class={clsx(styles.control, styles._token)}>
              <input type="password" class="form-control" placeholder="token" value={token} onChange={(ev) => setToken((ev.target as HTMLInputElement).value)} />
            </div>
        </div>
      </div>
      <div class={clsx("container", styles.container)}>
        <div class={clsx(styles.content)}>
          <textarea ref={$instructionsRef} class={clsx("form-control", styles.instructions)}>Говори четко и размеренно.</textarea>
          <textarea ref={$textRef} class={clsx("form-control", styles.text)}>Приветствую вас! Я ваш виртуальный ассистент. Здесь, чтобы облегчить вашу задачу: задавайте вопрос, а я найду решение.</textarea>
        </div>
      </div>
    </div>
  );
}
function downloadBlob(blob: Blob, fileName: string): void {
  // 1. Создаем временную ссылку на Blob в памяти
  const url = URL.createObjectURL(blob);
  
  // 2. Создаем невидимый элемент <a>
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName; // Имя файла, под которым он сохранится
  
  // 3. Добавляем в DOM (необязательно, но полезно для Safari) и кликаем
  document.body.appendChild(link);
  link.click();
  
  // 4. Удаляем мусор
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}