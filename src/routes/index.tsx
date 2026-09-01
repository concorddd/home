import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Concord — Chat em canais em tempo real" },
      {
        name: "description",
        content:
          "Concord é um chat em canais no estilo Discord: servidores, canais de texto e mensagens instantâneas.",
      },
      { property: "og:title", content: "Concord — Chat em canais em tempo real" },
      {
        property: "og:description",
        content: "Servidores, canais de texto e mensagens instantâneas no Concord.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/canais" : "/login" });
  },
  component: () => null,
});
