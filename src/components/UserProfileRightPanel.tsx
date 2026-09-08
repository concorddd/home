import { Phone, Video as VideoIcon, Mic, MicOff, Headphones, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCalls } from "@/hooks/call-context";
import { ProfilePanel, type Peer } from "@/components/ProfilePanel";

type Props = {
  profile: Peer;
  isFriend?: boolean;
  onClose: () => void;
  /** Painel do próprio usuário: abre as configurações (engrenagem). */
  onOpenSettings?: () => void;
};

/**
 * Painel direito unificado (DM e servidores): barra de chamada fixa no topo,
 * esticada até a borda direita da tela, e o ProfilePanel abaixo, rebaixado e
 * com cantos arredondados (rounded-l-xl já aplicado no aside do ProfilePanel).
 *
 * - Perfil de outra pessoa → botões de ligação de voz e vídeo.
 * - Próprio perfil → microfone, fone (mute total) e configurações.
 */
export function UserProfileRightPanel({
  profile,
  isFriend = false,
  onClose,
  onOpenSettings,
}: Props) {
  const { user } = useAuth();
  const { selfMute, selfDeafen, toggleSelfMute, toggleSelfDeafen, startCall } =
    useCalls();

  const isSelf = profile.id === user?.id;
  const micMuted = selfMute || selfDeafen;

  return (
    <div className="hidden shrink-0 flex-col lg:flex">
      {/* Barra de chamada — topo, esticada até a borda direita da tela */}
      <div className="flex w-full shrink-0 items-center gap-1 p-2">
        {isSelf ? (
          <>
            <button
              type="button"
              title={micMuted ? "Ativar microfone" : "Silenciar microfone"}
              aria-label={micMuted ? "Ativar microfone" : "Silenciar microfone"}
              onClick={toggleSelfMute}
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                micMuted
                  ? "bg-[#2b2d31] text-[#f0553c] hover:bg-[#3a3c40]"
                  : "bg-[#2b2d31] text-[#dbdee1] hover:bg-[#3a3c40]"
              }`}
            >
              {micMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
            <button
              type="button"
              title={selfDeafen ? "Desativar mute total" : "Mute total (não escutar e não falar)"}
              aria-label={selfDeafen ? "Desativar mute total" : "Mute total"}
              onClick={toggleSelfDeafen}
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                selfDeafen
                  ? "bg-[#2b2d31] text-[#f0553c] hover:bg-[#3a3c40]"
                  : "bg-[#2b2d31] text-[#dbdee1] hover:bg-[#3a3c40]"
              }`}
            >
              <Headphones className="size-5" />
            </button>
            {onOpenSettings && (
              <button
                type="button"
                title="Configurações do usuário"
                aria-label="Configurações do usuário"
                onClick={onOpenSettings}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#2b2d31] text-[#dbdee1] transition-all duration-300 hover:rotate-45 hover:bg-[#3a3c40]"
              >
                <Settings className="size-5" />
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              title="Chamada de voz"
              disabled={!isFriend}
              onClick={() => void startCall(profile, false)}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#2b2d31] text-[#dbdee1] transition-colors hover:bg-[#3a3c40] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Phone className="size-5" />
            </button>
            <button
              type="button"
              title="Chamada de vídeo"
              disabled={!isFriend}
              onClick={() => void startCall(profile, true)}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#2b2d31] text-[#dbdee1] transition-colors hover:bg-[#3a3c40] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <VideoIcon className="size-5" />
            </button>
          </>
        )}
      </div>

      {/* Painel do perfil — rebaixado (abaixo da barra), preenche o restante */}
      <ProfilePanel profile={profile} onClose={onClose} className="min-h-0 flex-1" />
    </div>
  );
}
