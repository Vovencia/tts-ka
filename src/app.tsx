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
);

const FILE_FORMAT: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm' = "aac";

// 2. Функция полного сброса кэша
const clearAppCache = (): void => {
  const result = confirm("Будет сброшен кэш и перезагружено приложение. Продолжить?");
  if (!result) {
    return;
  }
  void (async () => {
    if (!('caches' in window)) return false;

    try {
      // Получаем все ключи кэша
      const cacheNames = await caches.keys();
      
      // Удаляем каждый кэш
      await Promise.all(
        cacheNames.map(name => caches.delete(name))
      );

      // Опционально: отменяем регистрацию SW, чтобы он не пересоздал кэш сразу
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }

      console.log('Cache and Service Worker cleared');

      window.location.reload();
    } catch (error) {
      console.error('Failed to clear cache:', error);
      alert('Failed to clear cache:' + error);
    }
  })();
};


export function App() {
  const [, update] = useState(0);
  const [playProgress, setPlayProgress] = useState({
    current: 0,
    total: 0,
  });
  const [token, setToken] = useState(Params.Get("token") ?? "");
  const [downloadingState, setDownloadState] = useState({
    receivedLength: 0,
    contentLength: 0,
    progress: 0,
    state: "generating" as "downloading" | "generating",
  });

  const $voicesRef = useRef<HTMLSelectElement>(null);
  const $textRef = useRef<HTMLTextAreaElement>(null);
  const $instructionsRef = useRef<HTMLTextAreaElement>(null);

  const openai = useRef<OpenAI | null>(null);
  const downloadTime = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const isDownloading = downloadTime.current !== 0;

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
    downloadTime.current = Date.now();
    update(Date.now());

    if (!openai.current) {
      return;
    }

    const input = $textRef.current!.value;
    const instructions = $instructionsRef.current!.value;
    const voice = $voicesRef.current!.value;

    Params.Set("voice", voice as IVoice);

    const intervalDelayUpdater = setInterval(() => {
      setDownloadState({
        ...calcGeneratingProgress(downloadTime.current, input),
        state: "generating",
      });
    }, 333);

    // 1. Получаем данные как Blob
    const blob = await (async () => {
      try {
        const response = await openai.current!.audio.speech.create({
            model: "gpt-4o-mini-tts",
            voice,
            input,
            instructions,
            // response_format: "wav",
            response_format: FILE_FORMAT,
            speed: 1.0,
            stream_format: "audio",
        });

        return await fetchBlobWithProgress(response, (data) => void setDownloadState({
          ...data,
          state: "downloading",
        }));
      } catch (err) {
        alert(err);
        return null;
      }
    })();

    clearInterval(intervalDelayUpdater);
    blobRef.current = blob;

    if (blob) {
      // 2. Создаем URL для Blob
      const audioUrl = URL.createObjectURL(blob);

      // 3. Создаем и запускаем аудио
      const audio = new Audio(audioUrl);

      // Освобождаем память после завершения воспроизведения
      audio.addEventListener('ended', () => {
        update(Date.now());
      });
      audio.addEventListener('timeupdate', () => {
        setPlayProgress({
          current: audio.currentTime,
          total: audio.duration,
        });
      });
      setPlayProgress({
        current: audio.currentTime,
        total: audio.duration,
      });
      audioRef.current = audio;
    }
    downloadTime.current = 0;
    setDownloadState({
      contentLength: 0,
      progress: 0,
      receivedLength: 0,
      state: "generating",
    })

    update(Date.now());

    playCallback();
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

    const fileName = prompt("Введите название файла (или оставьте пустым)", $voicesRef.current!.value);
    downloadBlob(blobRef.current, `${ fileName || $voicesRef.current!.value }.${ FILE_FORMAT }`);

    update(Date.now());
  }, []);

  const MAX_TOKENS = 2000;
  const currentTokens = Math.floor(($textRef.current?.value ?? "").length / 2.5);
  const currentTokensProgress = Math.min(currentTokens * 100 / MAX_TOKENS, 100);
  const currentTokensOverhead = currentTokens > MAX_TOKENS;

  const isButtonEncodeDisabled = isDownloading || !openai.current || currentTokensOverhead;
  const isButtonPlayDisabled = !audioRef.current || !audioRef.current.paused;
  const isButtonPauseDisabled = !audioRef.current || audioRef.current.paused;
  const isButtonDownloadDisabled = !blobRef.current;

  const progressValue = isDownloading ? downloadingState.receivedLength : playProgress.current;
  const progressTotal = isDownloading ? downloadingState.contentLength : playProgress.total;

  const progressPercent = progressValue * 100 / (progressTotal || 1);

  const progressClass = isDownloading ? `progress-bar progress-bar-striped bg-${ downloadingState.state === "generating" ? "warning" : "success" }` : "progress-bar";

  return (
    <div class={styles.app}>
      <nav class={clsx("navbar bg-primary", styles.header)} data-bs-theme="dark">
        <div class="container-fluid">
          <a class="navbar-brand" href="https://github.com/Vovencia/tts-ka" target="_blank">TTS-ka</a>
          <div class={clsx(styles.controls__list, styles._top)}>
            <div class={clsx(styles.control, styles._token)}>
              <input type="password" class="form-control" placeholder="token" value={token} onChange={(ev) => setToken((ev.target as HTMLInputElement).value)} />
            </div>
            <div class={clsx(styles.control)}>
              <button type="button" class="btn btn-danger" onClick={clearAppCache}><i class="bi bi-arrow-clockwise"></i></button>
            </div>
          </div>
        </div>
      </nav>
      <div class={clsx("container", styles.controls)}>
        <div class={clsx(styles.controls__list, styles._center)}>
          <div class={clsx(styles.control)}>
            <select ref={$voicesRef} class="form-select" aria-label="Default select example">
              { voices.map((voice) => (<option selected={ voice === Params.Get("voice") } value={voice}>{ voice }</option>)) }
            </select>
          </div>
          <div class={clsx(styles.control)}>
            <button type="button" class="btn btn-primary" disabled={isButtonEncodeDisabled} onClick={encodeCallback}>send</button>
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
        </div>
      </div>
      <div class={clsx("container", styles.container)}>
        <div class={clsx("progress", styles.progress)}>
          <div class={ progressClass } style={{
            width: `${ progressPercent }%`,
          }}>
            { progressValue.toFixed(2) } / { progressTotal.toFixed(2) }
          </div>
        </div>
        <div class={clsx(styles.content)}>
          <textarea ref={$instructionsRef} class={clsx("form-control", styles.instructions)}>Говори четко и размеренно.</textarea>
          <div class="progress">
            <div class={clsx("progress-bar", `text-bg-${ currentTokensOverhead ? 'danger' : 'info' }`)} style={{width: `${ currentTokensProgress }%`}}>
              { currentTokens.toFixed(0) } / { MAX_TOKENS.toFixed(0) }
            </div>
          </div>
          <textarea ref={$textRef} class={clsx("form-control", styles.text)} onInput={() => void update(Date.now())}>Приветствую вас! Я ваш виртуальный ассистент. Здесь, чтобы облегчить вашу задачу: задавайте вопрос, а я найду решение.</textarea>
        </div>
        <div style={{textAlign: "right", color: "#000000", opacity: 0.3}}>proxied by <a href="https://proxyapi.ru/" target="_blank" style={{color: "#000000"}}>proxyapi.ru</a></div>
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

async function fetchBlobWithProgress(response: Response, callback: (state: {
  receivedLength: number;
  contentLength: number;
  progress: number;
}) => void): Promise<Blob> {
  if (!response.ok) throw new Error(`Ошибка: ${response.status}`);
  if (!response.body) throw new Error('Тело ответа пустое');

  const reader = response.body.getReader();
  const contentLength = Number(response.headers.get('Content-Length')) || 0;

  let receivedLength = 0;
  const chunks: BlobPart[] = [];  // Массив для хранения частей данных

  while (true) {
    const { done, value } = await reader.read();

    if (value == null) {
      if (done) {
        break;
      }
      continue;
    }

    chunks.push(value);
    receivedLength += value.length;

    const progress = (receivedLength / (contentLength || 1)) * 100;

    callback({
      receivedLength: receivedLength / (1024*1024),
      contentLength: contentLength / (1024*1024),
      progress,
    });

    if (done) {
      break;
    }
  }

  // Создаем итоговый Blob из всех накопленных частей
  return new Blob(chunks);
}

function calcGeneratingProgress(startTime: number, text: string) {
  /** tokens per sec */
  const speed = 30;
  /** средний размер токена: 2.5 русских симовлов */
  const totalTokens = text.length / 2.5;

  let generationTime = (Date.now() - startTime) / 1000;
  const totalTime = totalTokens / speed;

  if (generationTime > totalTime) {
    generationTime = totalTime;
  }

  return {
    receivedLength: generationTime,
    contentLength: totalTime,
    progress: generationTime / (totalTime || 1) * 100,
  };
}
