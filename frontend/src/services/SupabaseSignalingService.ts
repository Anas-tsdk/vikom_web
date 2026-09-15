import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { getToken } from '../auth/AuthService';

// Re-exported so existing importers of this module keep working; the flag and
// the client itself now live in ./supabaseClient. Patient profile lookups do NOT
// use it — they go through the backend (GET /api/patients/supabase-profiles).
export { isSupabaseConfigured };

type SignalingCallback = (payload: unknown) => void;

interface DurableCallEvent {
    id: number;
    call_id: string;
    event_type: string;
    payload: Record<string, unknown>;
}

class SupabaseSignalingService {
    private channel: RealtimeChannel | null = null;
    private currentUserId: string | null = null;
    private callbacks: Record<string, SignalingCallback[]> = {};
    private connectionPromise: Promise<void> | null = null;
    private currentCallId: string | null = null;
    private pollTimer: number | null = null;
    private polling = false;
    private handledMessages = new Set<string>();

    /**
     * Initializes the signaling channel and sets the current user id
     * (needed to filter messages meant for this client).
     */
    async initialize(userId: string, callId?: string): Promise<void> {
        if (!isSupabaseConfigured) {
            throw new Error(
                'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
            );
        }
        if (this.channel && this.currentUserId !== userId) {
            this.disconnect();
        }
        this.currentUserId = userId;
        // Set this before either the Realtime subscription or durable polling
        // can deliver queued events. Otherwise a stale answer from an older
        // call could briefly be accepted while currentCallId is still null.
        if (callId) this.currentCallId = callId;
        if (this.channel && this.connectionPromise) return this.connectionPromise;

        this.channel = getSupabaseClient().channel('webrtc-signaling');
        this.channel
            .on('broadcast', { event: 'message' }, (payload) => {
                this.handleIncomingMessage(payload.payload);
            });
        this.connectionPromise = new Promise<void>((resolve, reject) => {
            let settled = false;
            const accept = () => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeoutId);
                resolve();
            };
            const tryDurableFallback = async (realtimeError: string) => {
                if (settled) return;
                try {
                    await this.invokeInfrastructure({ action: 'poll' });
                    accept();
                } catch {
                    if (settled) return;
                    settled = true;
                    window.clearTimeout(timeoutId);
                    reject(new Error(realtimeError));
                }
            };
            const timeoutId = window.setTimeout(() => {
                void tryDurableFallback('Supabase signaling connection timed out');
            }, 8_000);

            this.channel?.subscribe((status) => {
                console.log('Supabase realtime status:', status);
                if (status === 'SUBSCRIBED') {
                    accept();
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    void tryDurableFallback(`Supabase signaling channel failed: ${status}`);
                }
            });
        });
        this.startDurablePolling();

        return this.connectionPromise;
    }

    /**
     * Leaves the channel and cleans up
     */
    disconnect() {
        if (this.channel) {
            void getSupabaseClient().removeChannel(this.channel);
            this.channel = null;
        }
        this.currentUserId = null;
        this.currentCallId = null;
        this.connectionPromise = null;
        if (this.pollTimer !== null) window.clearTimeout(this.pollTimer);
        this.pollTimer = null;
        this.polling = false;
        this.handledMessages.clear();
    }

    /**
     * Subscribe to specific event types (e.g. "call_answer", "call_rejected")
     */
    on(eventType: string, callback: SignalingCallback) {
        if (!this.callbacks[eventType]) {
            this.callbacks[eventType] = [];
        }
        this.callbacks[eventType].push(callback);
    }

    /**
     * Unsubscribe
     */
    off(eventType: string, callback: SignalingCallback) {
        if (!this.callbacks[eventType]) return;
        this.callbacks[eventType] = this.callbacks[eventType].filter(cb => cb !== callback);
    }

    /**
     * Internal message handler
     */
    private handleIncomingMessage(wrapper: unknown) {
        // We only process messages addressed to this specific user
        if (!wrapper || typeof wrapper !== 'object') {
            return;
        }

        const message = wrapper as { targetUserId?: unknown; type?: unknown; payload?: unknown };
        if (message.targetUserId !== this.currentUserId) return;

        const type = typeof message.type === 'string' ? message.type : '';
        let innerPayload: unknown = {};
        try {
            if (typeof message.payload === 'string') {
                innerPayload = JSON.parse(message.payload);
            }
        } catch (e) {
            console.error("Failed to parse inner payload", e);
        }

        const messageKey = `${type}\n${JSON.stringify(innerPayload)}`;
        if (this.handledMessages.has(messageKey)) return;
        this.handledMessages.add(messageKey);
        while (this.handledMessages.size > 512) {
            const oldest = this.handledMessages.values().next().value as string | undefined;
            if (!oldest) break;
            this.handledMessages.delete(oldest);
        }

        const payloadCallId = innerPayload && typeof innerPayload === 'object' && 'callId' in innerPayload
            ? (innerPayload as { callId?: unknown }).callId
            : undefined;
        if (typeof payloadCallId === 'string' && payloadCallId && this.currentCallId
            && payloadCallId !== this.currentCallId) return;

        if (type && this.callbacks[type]) {
            this.callbacks[type].forEach(cb => cb(innerPayload));
        }
    }

    /**
     * Broadcasts a call offer to the target TV User.
     */
    private async broadcast(targetUserId: string, type: string, payload: object): Promise<void> {
        let durableError: unknown = null;
        try {
            await this.invokeInfrastructure({ action: 'send', targetUserId, type, payload });
            return;
        } catch (error) {
            durableError = error;
            // Local projects may not have deployed the durable Edge Function
            // yet. Keep legacy realtime as a development-only fallback.
        }
        if (!import.meta.env.DEV) {
            throw durableError instanceof Error
                ? durableError
                : new Error('Secure call signaling is unavailable');
        }
        if (!this.channel) throw new Error('No call signaling transport is available');
        const result = await this.channel.send({
                type: 'broadcast',
                event: 'message',
                payload: { targetUserId, type, payload: JSON.stringify(payload) },
            });
        if (result !== 'ok') throw new Error(`Supabase signaling broadcast failed: ${result}`);
    }

    private async invokeInfrastructure(body: Record<string, unknown>): Promise<unknown> {
        const token = getToken();
        const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
        if (!token || !url || !apiKey) throw new Error('Call infrastructure is not configured');
        const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/call-infrastructure`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                apikey: apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`Call infrastructure returned HTTP ${response.status}`);
        return await response.json();
    }

    private startDurablePolling() {
        if (this.pollTimer !== null) return;
        const poll = async () => {
            if (!this.currentUserId || this.polling) return;
            this.polling = true;
            try {
                const result = await this.invokeInfrastructure({ action: 'poll' }) as { events?: DurableCallEvent[] };
                const events = Array.isArray(result.events) ? result.events : [];
                const ids: number[] = [];
                for (const event of events) {
                    ids.push(event.id);
                    this.handleIncomingMessage({
                        targetUserId: this.currentUserId,
                        type: event.event_type,
                        payload: JSON.stringify(event.payload ?? {}),
                    });
                }
                if (ids.length > 0) await this.invokeInfrastructure({ action: 'ack', ids });
            } catch {
                // The Edge Function is an optional reliability layer during
                // local development. Realtime continues uninterrupted.
            } finally {
                this.polling = false;
                if (this.currentUserId) this.pollTimer = window.setTimeout(poll, 1500);
            }
        };
        this.pollTimer = window.setTimeout(poll, 0);
    }

    async getManagedIceServers(): Promise<RTCIceServer[]> {
        try {
            const result = await this.invokeInfrastructure({ action: 'turn' }) as { iceServers?: unknown };
            if (!Array.isArray(result.iceServers)) return [];
            return result.iceServers.flatMap((item): RTCIceServer[] => {
                if (!item || typeof item !== 'object') return [];
                const value = item as { urls?: unknown; username?: unknown; credential?: unknown };
                const urls = Array.isArray(value.urls)
                    ? value.urls.filter((url): url is string => typeof url === 'string')
                    : typeof value.urls === 'string' ? value.urls : [];
                if (Array.isArray(urls) && urls.length === 0) return [];
                return [{
                    urls,
                    username: typeof value.username === 'string' ? value.username : undefined,
                    credential: typeof value.credential === 'string' ? value.credential : undefined,
                }];
            });
        } catch {
            return [];
        }
    }

    async sendCallOffer(
        callId: string,
        targetUserId: string,
        callerId: string,
        callerName: string,
        sdp: string,
        mediaType: 'audio' | 'video',
    ): Promise<void> {
        if (!this.channel) throw new Error('Signaling service not initialized');

        // The TV App expects these exact fields in the inner payload
        const innerPayload = {
            callId,
            callerId,
            callerUserId: callerId, // some redundancies required by TV App
            callerName,
            callerUsername: callerName, // TV App's CallOffer requires this (non-optional) or it fails to deserialize the offer
            sdp,
            mediaType,
        };

        this.currentCallId = callId;
        await this.broadcast(targetUserId, 'call_offer', innerPayload);
    }

    async sendIceCandidate(callId: string, targetUserId: string, candidate: RTCIceCandidate): Promise<void> {
        await this.broadcast(targetUserId, 'ice_candidate', {
            callId,
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
        });
    }

    async requestVideoUpgrade(callId: string, targetUserId: string): Promise<void> {
        await this.broadcast(targetUserId, 'video_upgrade_request', {
            callId,
            timestamp: Date.now(),
        });
    }

    async respondToVideoUpgrade(callId: string, targetUserId: string, accepted: boolean): Promise<void> {
        await this.broadcast(targetUserId, 'video_upgrade_response', {
            callId,
            accepted,
            timestamp: Date.now(),
        });
    }

    async sendCameraState(callId: string, targetUserId: string, enabled: boolean): Promise<void> {
        await this.broadcast(targetUserId, 'camera_state', {
            callId,
            enabled,
            timestamp: Date.now(),
        });
    }

    /**
     * Broadcasts a call ended event to cancel an actively ringing outbound call.
     */
    async sendCallEnded(callId: string, targetUserId: string, reason: string = "caller_cancelled") {
        if (!this.channel) return;

        const innerPayload = {
            callId,
            reason,
            duration: 0
        };

        await this.broadcast(targetUserId, 'call_ended', innerPayload);
    }
}

// Export singleton instance
export const signalingService = new SupabaseSignalingService();
