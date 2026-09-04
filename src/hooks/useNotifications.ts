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

// Sons sintetizados via Web Audio API — sem necessidade de arquivos de áudio.
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const t0 = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function playTonePattern(ringtone: string, volume: number) {
  const ctx = getAudioContext();
  if (!ctx || volume <= 0) return;
  switch (ringtone) {
    case 'chime':
      tone(ctx, 659.25, 0, 0.15, volume);
      tone(ctx, 987.77, 0.15, 0.25, volume);
      break;
    case 'bell':
      tone(ctx, 1567.98, 0, 0.6, volume, 'triangle');
      tone(ctx, 2093.0, 0.02, 0.45, volume * 0.5);
      break;
    case 'pop':
      tone(ctx, 440, 0, 0.06, volume, 'square');
      tone(ctx, 880, 0.06, 0.1, volume, 'square');
      break;
    default: // bip padrão
      tone(ctx, 880, 0, 0.15, volume);
      tone(ctx, 880, 0.2, 0.12, volume * 0.7);
  }
}

function playRingPattern(ringtone: string, volume: number) {
  const ctx = getAudioContext();
  if (!ctx || volume <= 0) return;
  switch (ringtone) {
    case 'chime':
      tone(ctx, 783.99, 0, 0.35, volume);
      tone(ctx, 659.25, 0.4, 0.35, volume);
      break;
    case 'bell':
      tone(ctx, 1567.98, 0, 0.5, volume, 'triangle');
      tone(ctx, 1567.98, 0.55, 0.5, volume * 0.8, 'triangle');
      break;
    case 'pop':
      tone(ctx, 660, 0, 0.12, volume, 'square');
      tone(ctx, 660, 0.18, 0.12, volume, 'square');
      tone(ctx, 880, 0.36, 0.18, volume, 'square');
      break;
    default: // toque clássico de telefone
      tone(ctx, 440, 0, 0.4, volume);
      tone(ctx, 480, 0.45, 0.4, volume);
  }
}

// Ringback de saída ("dum-dum… dum-dum") no estilo Discord.
function playRingbackPattern(volume: number) {
  const ctx = getAudioContext();
  if (!ctx || volume <= 0) return;
  tone(ctx, 587.33, 0, 0.12, volume);
  tone(ctx, 440, 0.14, 0.22, volume);
  tone(ctx, 587.33, 1.0, 0.12, volume);
  tone(ctx, 440, 1.14, 0.22, volume);
}

export function useNotifications(userId: string | undefined) {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const ringIntervalRef = useRef<number | null>(null);
  const ringbackIntervalRef = useRef<number | null>(null);

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
    playTonePattern(settings.ringtone, Math.min(1, settings.notificationVolume / 100));
  }, [settings.soundEnabled, settings.notificationVolume, settings.ringtone]);

  // Tocar som de chamada (repete até ser interrompido)
  const playCallRingtone = useCallback(() => {
    if (!settings.soundEnabled || settings.callVolume === 0) return;
    const vol = Math.min(1, settings.callVolume / 100);
    playRingPattern(settings.ringtone, vol);
    if (ringIntervalRef.current !== null) window.clearInterval(ringIntervalRef.current);
    ringIntervalRef.current = window.setInterval(
      () => playRingPattern(settings.ringtone, vol),
      2000,
    );
  }, [settings.soundEnabled, settings.callVolume, settings.ringtone]);

  // Parar som de chamada
  const stopCallRingtone = useCallback(() => {
    if (ringIntervalRef.current !== null) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  }, []);

  // Ringback de saída (som de "ligando…" estilo Discord)
  const playRingbackTone = useCallback(() => {
    if (!settings.soundEnabled || settings.callVolume === 0) return;
    const vol = Math.min(1, settings.callVolume / 100);
    playRingbackPattern(vol);
    if (ringbackIntervalRef.current !== null) window.clearInterval(ringbackIntervalRef.current);
    ringbackIntervalRef.current = window.setInterval(
      () => playRingbackPattern(vol),
      2500,
    );
  }, [settings.soundEnabled, settings.callVolume]);

  // Parar ringback de saída
  const stopRingbackTone = useCallback(() => {
    if (ringbackIntervalRef.current !== null) {
      window.clearInterval(ringbackIntervalRef.current);
      ringbackIntervalRef.current = null;
    }
  }, []);

  // Mostrar notificação desktop
  const showDesktopNotification = useCallback((title: string, options?: {
    body?: string; tag?: string; type?: NotificationType; data?: Record<string, string>;
  }) => {
    if (!settings.desktopNotifications || permission !== 'granted') return;
    if (!('Notification' in window)) return;
    try {
      const notificationOptions: NotificationOptions & { vibrate?: number[] } = {
        body: options?.body || '',
        icon: '/icon-192x192.png',
        tag: options?.tag || 'concord',
        vibrate: [200, 100, 200],
        data: { type: options?.type, ...options?.data },
      };
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, notificationOptions);
        });
      } else {
        new Notification(title, {
          body: options?.body || '',
          icon: '/icon-192x192.png',
          ...(options?.tag ? { tag: options.tag } : {}),
        });
      }
    } catch {}
  }, [settings.desktopNotifications, permission]);

  // Notificação de mensagem
  const notifyMessage = useCallback((senderName: string, messageContent: string, channelName: string, data?: Record<string, string>) => {
    if (!settings.enabled || !settings.messageNotifications) return;
    playNotificationSound();
    const preview = settings.showPreview ? messageContent : 'Nova mensagem';
    showDesktopNotification(`${senderName} em #${channelName}`, {
      body: preview,
      tag: `msg_${data?.['channelId'] || ''}`,
      type: 'message',
      ...(data ? { data } : {}),
    });
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
    playRingbackTone, stopRingbackTone,
    notifyMessage, notifyDM, notifyCall, notifyFriendRequest
  };
}
