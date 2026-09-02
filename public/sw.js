// Service Worker para notificações push do Concord
// Este arquivo permite que notificações apareçam mesmo com o site fechado

const CACHE_NAME = 'concord-notifications-v1';

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker instalado');
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker ativado');
  event.waitUntil(self.clients.claim());
});

// Recebimento de notificações push
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'Nova notificação',
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'concord-notification',
      renotify: true,
      requireInteraction: true,
      actions: data.actions || [
        { action: 'open', title: 'Abrir' },
        { action: 'dismiss', title: 'Dispensar' }
      ],
      data: data.payload || {}
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Concord', options)
    );
  } catch (error) {
    console.error('[SW] Erro ao processar push:', error);
  }
});

// Clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const action = event.action;

  if (action === 'dismiss') return;

  // URL para redirecionar (padrão ou específico)
  let url = '/canais';
  if (notificationData.type === 'dm' && notificationData.userId) {
    url = `/dm/${notificationData.userId}`;
  } else if (notificationData.type === 'server' && notificationData.channelId) {
    url = `/canais/${notificationData.channelId}`;
  } else if (notificationData.type === 'call') {
    url = notificationData.callUrl || '/canais';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Foca em uma janela existente se possível
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url: url,
            data: notificationData
          });
          return;
        }
      }
      // Abre nova janela se necessário
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

// Fechar notificação
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notificação fechada:', event.notification.tag);
});