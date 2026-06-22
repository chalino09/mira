"use client";

import { ExternalLink, RefreshCw, Send, Unlink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { appErrorMessage } from "@/lib/errors";
import { useGreenhouseStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type TelegramConnection = {
  status: "pending" | "active" | "disabled";
  external_username: string | null;
  external_display_name: string | null;
  verified_at: string | null;
};

export function TelegramConnectionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const organization = useGreenhouseStore((state) => state.organization);
  const [connection, setConnection] = useState<TelegramConnection | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");

  const loadConnection = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id || !currentUser.id) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("notification_connections")
      .select("status, external_username, external_display_name, verified_at")
      .eq("company_id", organization.id)
      .eq("user_id", currentUser.id)
      .eq("channel", "telegram")
      .maybeSingle();
    setLoading(false);

    if (error) {
      setNotice(appErrorMessage(error, "No se pudo consultar Telegram."));
      return;
    }

    setConnection(data as TelegramConnection | null);
  }, [currentUser.id, organization.id]);

  useEffect(() => {
    if (!open) return;
    setNotice("");
    loadConnection();
  }, [loadConnection, open]);

  useEffect(() => {
    if (!open || connection?.status !== "pending") return;
    const interval = window.setInterval(loadConnection, 3000);
    return () => window.clearInterval(interval);
  }, [connection?.status, loadConnection, open]);

  const connect = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setWorking(true);
    setNotice("");
    const { data, error } = await supabase.functions.invoke("telegram-link", {
      body: { action: "link" }
    });
    setWorking(false);

    if (error || !data?.url) {
      setNotice(appErrorMessage(error, "No se pudo generar el enlace de Telegram."));
      return;
    }

    setConnection({ status: "pending", external_username: null, external_display_name: null, verified_at: null });
    window.location.assign(String(data.url));
  };

  const disconnect = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setWorking(true);
    setNotice("");
    const { error } = await supabase.functions.invoke("telegram-link", {
      body: { action: "disconnect" }
    });
    setWorking(false);

    if (error) {
      setNotice(appErrorMessage(error, "No se pudo desconectar Telegram."));
      return;
    }

    setConnection(null);
    setNotice("Telegram fue desconectado.");
  };

  const active = connection?.status === "active";
  const pending = connection?.status === "pending";

  return (
    <Modal onClose={onClose} open={open} title="Telegram">
      <div className="mx-auto max-w-xl">
        <div className="flex items-start justify-between gap-5 border-b border-app-border pb-6">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-soft text-app-green">
              <Send className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-xl font-medium text-app-text">Actividades en tu chat</h3>
              <p className="mt-2 text-sm leading-6 text-app-muted">
                Vincula tu cuenta para recibir la planeación operativa y reportar actividades desde Telegram.
              </p>
            </div>
          </div>
          <StatusBadge tone={active ? "green" : pending ? "amber" : "neutral"}>
            {loading ? "Consultando" : active ? "Conectado" : pending ? "Pendiente" : "Sin conectar"}
          </StatusBadge>
        </div>

        {active ? (
          <div className="py-7">
            <p className="text-sm font-medium text-app-text">
              {connection.external_display_name || connection.external_username || "Telegram conectado"}
            </p>
            {connection.external_username ? <p className="mt-1 text-sm text-app-muted">@{connection.external_username}</p> : null}
            <div className="mt-6 flex flex-wrap gap-2">
              <Button disabled={working} icon={<Unlink className="h-4 w-4" />} onClick={disconnect} variant="secondary">
                {working ? "Desconectando..." : "Desconectar"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-7">
            <p className="text-sm leading-6 text-app-muted">
              {pending
                ? "Abre Telegram y pulsa Iniciar. Esta pantalla comprobará la conexión automáticamente."
                : "Se abrirá el bot oficial de Mira con un enlace personal que vence en 10 minutos."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button disabled={working || loading} icon={<ExternalLink className="h-4 w-4" />} onClick={connect} variant="primary">
                {working ? "Generando..." : pending ? "Generar otro enlace" : "Conectar Telegram"}
              </Button>
              {pending ? (
                <Button disabled={loading} icon={<RefreshCw className="h-4 w-4" />} onClick={loadConnection} variant="secondary">
                  Comprobar
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {notice ? <p className="border-t border-app-border pt-4 text-sm text-app-muted">{notice}</p> : null}
      </div>
    </Modal>
  );
}
