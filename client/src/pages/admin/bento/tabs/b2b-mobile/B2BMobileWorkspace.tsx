import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { corporateApi } from "@/lib/api";
import PortalEntryScreen from "./PortalEntryScreen";
import ClientListScreen from "./ClientListScreen";
import ClientHubScreen from "./ClientHubScreen";
import ClientWorkspaceScreen from "./ClientWorkspaceScreen";

type Screen = "portal" | "clients" | "hub" | "workspace";

interface B2BMobileWorkspaceProps {
    initialClientId?: string | null;
    onExit: () => void;
}

/**
 * Full-screen B2B mode for mobile. Takes over the entire viewport (no bottom
 * nav, no admin chrome). The only way out is the X (exit) button on the
 * portal entry and workspace screens — back arrows only step within B2B mode.
 */
export default function B2BMobileWorkspace({ initialClientId, onExit }: B2BMobileWorkspaceProps) {
    const [screen, setScreen] = useState<Screen>(initialClientId ? "hub" : "portal");
    const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId ?? null);

    useEffect(() => {
        if (initialClientId) {
            setSelectedClientId(initialClientId);
            setScreen("hub");
        }
    }, [initialClientId]);

    const clientQuery = useQuery({
        queryKey: ["corporate-clients", selectedClientId],
        queryFn: () => corporateApi.getOne(selectedClientId!),
        enabled: !!selectedClientId,
    });

    return (
        <div className="fixed inset-0 z-[200] flex flex-col bg-white">
            {screen === "portal" && (
                <PortalEntryScreen onViewClients={() => setScreen("clients")} onExit={onExit} />
            )}

            {screen === "clients" && (
                <ClientListScreen
                    onBack={() => setScreen("portal")}
                    onSelectClient={(clientId) => {
                        setSelectedClientId(clientId);
                        setScreen("hub");
                    }}
                />
            )}

            {screen === "hub" && selectedClientId && (
                <ClientHubScreen
                    clientId={selectedClientId}
                    onBack={() => {
                        setSelectedClientId(null);
                        setScreen("clients");
                    }}
                    onOpenWorkspace={() => setScreen("workspace")}
                />
            )}

            {screen === "workspace" && selectedClientId && (
                <ClientWorkspaceScreen
                    clientId={selectedClientId}
                    companyName={clientQuery.data?.companyName || "Corporate Client"}
                    onBack={() => setScreen("hub")}
                    onExit={onExit}
                />
            )}
        </div>
    );
}
