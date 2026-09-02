import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type NotificationType = 'message' | 'dm' | 'call' | 'friend_request';

export interface NotificationSettings {
  enabled: boolean;
  messageNotifications: boolean;
  dmNotifications: boolean;
  callNotifications: boolean;
  friendRequestNotifications: boolean;
  notificationVolume: number;
  callVolume: number;
  ringtone: 'default' | 'chime' | 'bell' | 'pop';
  soundEnabled: boolean;
  desktopNotifications: boolean;
  showPreview: boolean;
}

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  messageNotifications: true,
  dmNotifications: true,
  callNotifications: true,
  friendRequestNotifications: true,
  notificationVolume: 70,
  callVolume: 80,
  ringtone: 'default',
  soundEnabled: true,
  desktopNotifications: true,
  showPreview: true,
};

const SOUND_URLS: Record<string, { notification: string; call: string }> = {
  default: { notification: '/sounds/notification.mp3', call: '/sounds/calling.mp3' },
  chime: { notification: '/sounds/chime.mp3', call: '/sounds/calling.mp3' },
  bell: { notification: '/sounds/bell.mp3', call: '/sounds/calling.mp3' },
  pop: { notification: '/sounds/pop.mp3', call: '/sounds/calling.mp3' }
};

export function useNotifications(userId: string | undefined) {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // Verificar suporte a notificações
  useEffect(() => {
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    setIsSupported(supported);
    if (supported && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Carregar configurações
  useEffect(() => {
    if (!userId) return;
    const saved = localStorage.getItem(`notificationSettings_${userId}`);
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch { setSettings(DEFAULT_SETTINGS); }
    }
  }, [userId]);

  // Salvar configurações
  const saveSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    if (!userId) return;
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(`notificationSettings_${userId}`, JSON.stringify(updated));
      return updated;
    });
  }, [userId]);

  // Registrar Service Worker
  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return false;
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      return true;
    } catch { return false; }
  }, []);

  // Solicitar permissão
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'denied' as NotificationPermission;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') await registerServiceWorker();
    return result;
  }, [registerServiceWorker]);

  // Tocar som de notificação
  const playNotificationSound = useCallback(() => {
    if (!settings.soundEnabled || settings.notificationVolume === 0) return;
    try {
      const soundUrl = SOUND_URLS[settings.ringtone]?.notification || SOUND_URLS.default.notification;
      if (!audioRef.current) {
        audioRef.current = new Audio(soundUrl);
      } else {
        audioRef.current.src = soundUrl;
      }
      audioRef.current.volume = settings.notificationVolume / 100;
      audioRef.current.play().catch(() => {});
    } catch {}
  }, [settings.soundEnabled, settings.notificationVolume, settings.ringtone]);

  // Tocar som de chamada
  const playCallRingtone = useCallback(() => {
    if (!settings.soundEnabled || settings.callVolume === 0) return;
    try {
      const soundUrl = SOUND_URLS[settings.ringtone]?.call || SOUND_URLS.default.call;
      if (!ringtoneRef.current) {
        ringtoneRef.current = new Audio(soundUrl);
        ringtoneRef.current.loop = true;
      } else {
        ringtoneRef.current.src = soundUrl;
      }
      ringtoneRef.current.volume = settings.callVolume / 100;
      ringtoneRef.current.play().catch(() => {});
    } catch {}
  }, [settings.soundEnabled, settings.callVolume, settings.ringtone]);

  // Parar som de chamada
  const stopCallRingtone = useCallback(() => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  }, []);

  // Mostrar notificação desktop
  const showDesktopNotification = useCallback((title: string, options?: {
    body?: string; tag?: string; type?: NotificationType; data?: Record<string, string>;
  }) => {
    if (!settings.desktopNotifications || permission !== 'granted') return;
    if (!('Notification' in window)) return;
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, {
            body: options?.body || '',
            icon: '/icon-192x192.png',
            tag: options?.tag || 'concord',
            vibrate: [200, 100, 200],
            data: { type: options?.type, ...options?.data },
            actions: [
              { action: 'open', title: 'Abrir' },
              { action: 'dismiss', title: 'Dispensar' }
            ]
          });
        });
      } else {
        new Notification(title, { body: options?.body || '', icon: '/icon-192x192.png', tag: options?.tag });
      }
    } catch {}
  }, [settings.desktopNotifications, permission]);

  // Notificação de mensagem
  const notifyMessage = useCallback((senderName: string, messageContent: string, channelName: string, data?: Record<string, string>) => {
    if (!settings.enabled || !settings.messageNotifications) return;
    playNotificationSound();
    const preview = settings.showPreview ? messageContent : 'Nova mensagem';
    showDesktopNotification(`${senderName} em #${channelName}`, { body: preview, tag: `msg_${data?.channelId || ''}`, type: 'message', data });
  }, [settings.enabled, settings.messageNotifications, settings.showPreview, playNotificationSound, showDesktopNotification]);

  // Notificação de DM
  const notifyDM = useCallback((senderName: string, messageContent: string, userId: string) => {
    if (!settings.enabled || !settings.dmNotifications) return;
    playNotificationSound();
    const preview = settings.showPreview ? messageContent : 'Nova mensagem direta';
    showDesktopNotification(`DM de ${senderName}`, { body: preview, tag: `dm_${userId}`, type: 'dm', data: { userId } });
  }, [settings.enabled, settings.dmNotifications, settings.showPreview, playNotificationSound, showDesktopNotification]);

  // Notificação de chamada
  const notifyCall = useCallback((callerName: string, callUrl?: string) => {
    if (!settings.enabled || !settings.callNotifications) return;
    playCallRingtone();
    showDesktopNotification(`📞 Chamada de ${callerName}`, { body: 'Clique para atender', tag: 'incoming_call', type: 'call', data: { callerName, callUrl: callUrl || '' } });
  }, [settings.enabled, settings.callNotifications, playCallRingtone, showDesktopNotification]);

  // Notificação de pedido de amizade
  const notifyFriendRequest = useCallback((fromName: string) => {
    if (!settings.enabled || !settings.friendRequestNotifications) return;
    playNotificationSound();
    showDesktopNotification('Pedido de amizade', { body: `${fromName} quer ser seu amigo`, tag: `friend_${fromName}`, type: 'friend_request', data: { fromName } });
  }, [settings.enabled, settings.friendRequestNotifications, playNotificationSound, showDesktopNotification]);

  return {
    settings, saveSettings, permission, isSupported, requestPermission,
    playNotificationSound, playCallRingtone, stopCallRingtone, showDesktopNotification,
    notifyMessage, notifyDM, notifyCall, notifyFriendRequest
  };
}