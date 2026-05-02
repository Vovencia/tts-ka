# Browser TTS

Преобразуем текст в речь используя `gpt-4o-mini-tts` через [https://proxyapi.ru/](https://proxyapi.ru/docs/openai-text-to-speech)

##### notes:
```
ffmpeg -i 250-milliseconds-of-silence.mp3 -map 0:a -c:a copy -map_metadata -1 250ms-silence.mp3
```