// Obsługa kliknięcia w istniejącym service workerze Workbox, bez planowania w tle.
self.addEventListener('notificationclick', (zdarzenie) => {
  zdarzenie.notification.close()
  const sciezka = zdarzenie.notification.data?.sciezka
  if (typeof sciezka !== 'string' || !sciezka.startsWith('/') || sciezka.startsWith('//')) return
  const adres = new URL(sciezka, self.location.origin)
  if (adres.origin !== self.location.origin) return
  zdarzenie.waitUntil((async () => {
    const okna = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const okno = okna.find((element) => new URL(element.url).origin === self.location.origin)
    if (okno) {
      await okno.navigate(adres.href)
      await okno.focus()
    } else await self.clients.openWindow(adres.href)
  })())
})
