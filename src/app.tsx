import clsx from 'clsx';
import encode from 'encode-audio';
import OpenAI from "openai";
import pLimit from 'p-limit';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import styles from './app.module.scss';

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

const FILE_FORMAT: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac' | 'pcm' = "flac";
const OUTPUT_FILE_FORMAT = "mp3" as const;

const MAX_TOKENS = 2000;
  /** средний размер токена: 2.5 русских символов */
const TOKEN_SIZE = 2.5;
const MAX_LENGTH = MAX_TOKENS * TOKEN_SIZE;
const LIMIT_REQUESTS = 8;

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
  const [textMode, setTextMode] = useState<"input" | "chunks">("input");
  const [text, setText] = useState("Приветствую вас! Я ваш виртуальный ассистент. Здесь, чтобы облегчить вашу задачу: задавайте вопрос, а я найду решение.");

  const $voicesRef = useRef<HTMLSelectElement>(null);
  // const $textRef = useRef<HTMLTextAreaElement>(null);
  const $instructionsRef = useRef<HTMLTextAreaElement>(null);

  const openai = useRef<OpenAI | null>(null);
  const downloadTime = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const chunksRef = useRef<readonly string[]>([]);
  chunksRef.current = splitText(text);

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

    const chunks = chunksRef.current;
    const instructions = $instructionsRef.current!.value;
    const voice = $voicesRef.current!.value as IVoice;

    Params.Set("voice", voice);

    const intervalDelayUpdater = setInterval(() => {
      setDownloadState({
        ...calcGeneratingProgress(
          downloadTime.current,
          Math.max(...chunks.map(item => item.length)),
          chunks.length / LIMIT_REQUESTS,
        ),
        state: "generating",
      });
    }, 333);

    // 1. Получаем данные как Blob
    const blob = await (async () => {
      try {
        return await TTS(chunks, {
          openai: openai.current!,
          voice,
          instructions,
        });
        // const response = await openai.current!.audio.speech.create({
        //     model: "gpt-4o-mini-tts",
        //     voice,
        //     input,
        //     instructions,
        //     // response_format: "wav",
        //     response_format: FILE_FORMAT,
        //     speed: 1.0,
        //     stream_format: "audio",
        // });

        // return await fetchBlobWithProgress(response, (data) => void setDownloadState({
        //   ...data,
        //   state: "downloading",
        // }));
      } catch (err) {
        alert(String(err));
        console.error(err);
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
      // Освобождаем память после завершения воспроизведения
      audio.addEventListener('pause', () => {
        update(Date.now());
      });
      audio.addEventListener('play', () => {
        update(Date.now());
      });
      audio.addEventListener('playing', () => {
        update(Date.now());
      });
      audio.addEventListener('abort', () => {
        update(Date.now());
      });
      audio.addEventListener('error', (err) => {
        alert(String(err));
        console.error(err);
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
    downloadBlob(blobRef.current, `${ fileName || $voicesRef.current!.value }.${ OUTPUT_FILE_FORMAT }`);

    update(Date.now());
  }, []);

  const currentTokens = Math.floor(Math.max(...chunksRef.current.map(item => item.length)) / TOKEN_SIZE);
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

  const $chunks = chunksRef.current.map((chunk) => {
    return (
      <li class={clsx("list-group-item", {
        "list-group-item-danger": chunk.length > MAX_LENGTH,
      })}>
        { chunk }
      </li>
    );
  });

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
            <button type="button" class="btn btn-warning" disabled={isButtonPauseDisabled}><i class="bi bi-pause-fill"></i></button>
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
          <div class={styles.text} data-text-mode={textMode}>
            <ul class="nav nav-tabs">
              <li class="nav-item">
                <button type="button" class={clsx("nav-link", {active: textMode === "input"})} onClick={() => setTextMode("input")}>
                  Оригинал
                </button>
              </li>
              <li class="nav-item">
                <button type="button" class={clsx("nav-link", {active: textMode === "chunks"})} onClick={() => setTextMode("chunks")}>
                  Части ({ $chunks.length })
                </button>
              </li>
            </ul>
            <textarea
              class={clsx("form-control", styles.textcontrol)}
              onInput={(ev) => {
                setText(ev.currentTarget.value);
              }}
            >{text}</textarea>
            <ul class={clsx("list-group", styles.textchunks)}>
              { $chunks }
            </ul>
          </div>
        </div>
        <div style={{textAlign: "right", color: "#000000", opacity: 0.3}}>proxied by <a href="https://proxyapi.ru/" target="_blank" style={{color: "#000000"}}>proxyapi.ru</a></div>
      </div>
    </div>
  );
}

async function TTS(input: readonly string[], params: {
  openai: OpenAI;
  voice: IVoice
  instructions: string;
}): Promise<Blob> {
  // Устанавливаем лимит в 10 потоков
  const limit = pLimit(LIMIT_REQUESTS);

  const blobs = await Promise.all(input.map(((item) => {
    return limit(() => TTSSingle(item, params));
  })));
  /** 250ms */
  // const silence = await getSilence();
  const chunks = (await Promise.all(blobs.map(item => item.arrayBuffer()))).reduce<ArrayBuffer[]>((result, buffer, index) => {
    if (index === 0) {
      return [
        ...result,
        buffer,
      ];
    }
    return [
      ...result,
      // silence,
      buffer,
    ];
  }, []);

  const audioBuffer = await joinAudioChunks(chunks, 500);
  // const blob = audioBufferToWav(audioBuffer);
  const blob = await ENCODERS[OUTPUT_FILE_FORMAT](audioBuffer);

  return blob;
}

async function TTSSingle(input: string, {
  openai,
  voice,
  instructions,
}: {
  openai: OpenAI;
  voice: IVoice
  instructions: string;
}): Promise<Blob> {
  // 1. Получаем данные как Blob
  return await (async () => {
    try {
      const response = await openai.audio.speech.create({
          model: "gpt-4o-mini-tts",
          voice,
          input: `.\t    \t ${ input } \t    \t.`,
          instructions,
          // response_format: "wav",
          response_format: FILE_FORMAT,
          speed: 1.0,
          stream_format: "audio",
      });

      return await response.blob();
    } catch (err) {
      alert(String(err));
      console.error(err);
      throw err;
    }
  })();
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
async function joinAudioChunks(arrayBuffers: readonly ArrayBuffer[], pauseDurationMS = 300): Promise<AudioBuffer> {
  const audioCtx = new (window.AudioContext || (window as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext)();
  
  // 1. Декодируем все чанки параллельно
  const audioBuffers = await Promise.all(
    arrayBuffers.map(buffer => audioCtx.decodeAudioData(buffer))
  );

  // 2. Рассчитываем параметры (берем параметры первого чанка)
  const sampleRate = audioBuffers[0].sampleRate;
  const numChannels = audioBuffers[0].numberOfChannels;
  const pauseSamples = (pauseDurationMS / 1000) * sampleRate;
  
  // Общая длина = сумма длин чанков + паузы между ними
  const totalLength = audioBuffers.reduce((acc, buf) => acc + buf.length, 0) + (pauseSamples * (audioBuffers.length - 1));

  // 3. Создаем итоговый буфер
  const finalBuffer = audioCtx.createBuffer(numChannels, totalLength, sampleRate);

  // 4. Копируем данные
  let currentOffset = 0;
  audioBuffers.forEach((buffer, index) => {
    for (let channel = 0; channel < numChannels; channel++) {
      finalBuffer.getChannelData(channel).set(buffer.getChannelData(channel), currentOffset);
    }
    currentOffset += buffer.length + (index < audioBuffers.length - 1 ? pauseSamples : 0);
  });

  return finalBuffer; // Далее используем bufferToWave (код из предыдущего ответа)
}

const ENCODERS = {
  mp3: async function audioBufferToMP3(buffer: AudioBuffer): Promise<Blob> {
    const flac = await encode.mp3(buffer, {
      sampleRate: buffer.sampleRate,
      channels: 1,
      bitDepth: 16,
      compression: 8,
      bitrate: 256,
      quality: 3,
    });

    return new Blob([flac as unknown as ArrayBuffer], {type: "audio/mp3"})
  },
  flac: async function audioBufferToFlac(buffer: AudioBuffer): Promise<Blob> {
    const flac = await encode.flac(buffer, {
      sampleRate: buffer.sampleRate,
      channels: 1,
      bitDepth: 16,
      compression: 8,
      bitrate: 256,
      quality: 3,
    });

    return new Blob([flac as unknown as ArrayBuffer], {type: "audio/flac"})
  },
  wav: async function audioBufferToWav(buffer: AudioBuffer): Promise<Blob> {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    // Плоская структура данных (interleaved)
    const length = buffer.length * numChannels * bytesPerSample + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    
    /* Пишем заголовки RIFF */
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, length - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, length - 44, true);

    // Пишем аудио данные
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        let sample = buffer.getChannelData(channel)[i];
        // Ограничиваем амплитуду и переводим в 16-бит
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }
} as const;

function calcGeneratingProgress(startTime: number, textLength: number, countGroup: number) {
  /** tokens per sec */
  const speed = 30;
  const totalTokens = (textLength / TOKEN_SIZE) * countGroup;

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

function splitText(text: string, {
  maxTokens = MAX_TOKENS,
  tokenSize = TOKEN_SIZE,
}: {
  maxTokens?: number;
  tokenSize?: number;
} = {}): readonly string[] {
  text = text.trim();

  const chunks = text.split(/^---$/).reduce<readonly string[]>((result, chunk) => {
    return [
      ...result,
      ...chunk.split(/\n\n+/),
    ];
  }, []);

  return chunks.reduce<readonly string[]>((result, chunk) => {
    if (chunk.length / tokenSize < maxTokens) {
      return [
        ...result,
        chunk,
      ];
    }

    return [
      ...result,
      ...chunk.split("\n"),
    ];
  }, []).reduce<readonly string[]>((result, chunk) => {
    if (chunk.length / tokenSize < maxTokens) {
      return [
        ...result,
        chunk,
      ];
    }

    return [
      ...result,
      ...chunk.split(". "),
    ];
  }, []).filter((item) => !!item.trim());
}
