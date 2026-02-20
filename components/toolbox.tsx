import React from "react";
import { moduleRegistry } from "../logic/moduleRegistry";
import { actionQueue } from "../utils/actionQueue";
import { stateManager } from "../utils/stateManager";

// Creating a dummy React component to represent Toolbox additions
// Vencord plugins typically inject these into specific areas (like the channel header)

export function SocializeToolbox(props: { channelId: string }) {
    const settings = moduleRegistry["settings"];

    if (!settings) return null;

    const handleClaim = () => actionQueue.enqueue(settings.claimCommand, props.channelId, true);
    const handleInfo = () => actionQueue.enqueue(settings.infoCommand, props.channelId, true);

    return (
        <div style={{ display: 'flex', gap: '8px', padding: '4px' }}>
            <button
                onClick={handleClaim}
                style={{
                    backgroundColor: '#5865F2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    cursor: 'pointer'
                }}
            >
                Claim
            </button>
            <button
                onClick={handleInfo}
                style={{
                    backgroundColor: '#4F545C',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    cursor: 'pointer'
                }}
            >
                Info
            </button>
        </div>
    );
}

export default SocializeToolbox;
