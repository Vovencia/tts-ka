const CACHE_NAME = 'app-v1';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Проверяем, что запрос идет к нашему домену
  // self.location.origin — это домен, на котором запущен Service Worker
  if (url.origin !== self.location.origin) {
    return; // Игнорируем сторонние запросы (Google Analytics, API и т.д.)
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Если ресурс есть в кэше, возвращаем его, но параллельно обновляем
      if (cachedResponse) {
        // // Опционально: запускаем фоновое обновление (Stale-While-Revalidate)
        // fetch(event.request).then((networkResponse) => {
        //   if (networkResponse.ok) {
        //     caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
        //   }
        // });
        return cachedResponse;
      }

      // Если в кэше нет — идем в сеть, получаем и сохраняем
      return fetch(event.request).then((response) => {
        // Проверяем, что ответ валидный и его можно кэшировать
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      });
    })
  );
});
