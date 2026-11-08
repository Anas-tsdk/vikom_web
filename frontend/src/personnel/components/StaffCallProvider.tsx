import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert, Button, Modal, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { getUserInfo } from '../../auth/AuthService';
import { isPortalRole } from '../../auth/roles';
import { isSupabaseConfigured, signalingService } from '../../services/SupabaseSignalingService';
import {
  StaffCallingContext,
  type CallRecipient,
  type StaffCallMediaType,
  type StaffCallingContextValue,
} from './StaffCallingContext';

type CallStatus = 'incoming' | 'calling' | 'ringing' | 'connecting' | 'active' | 'ended' | 'failed';

interface CallSession {
  callId: string;
  direction: 'incoming' | 'outgoing';
  remoteUserId: string;
  remoteName: string;
  mediaType: StaffCallMediaType;
  status: CallStatus;
  error?: string;
  sdp?: string;
}

interface CallOfferPayload {
  callId?: unknown;
  callerId?: unknown;
  callerName?: unknown;
  sdp?: unknown;
  mediaType?: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const StaffCallProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { t } = useTranslation();
  const translationRef = useRef(t);
  useEffect(() => {
    translationRef.current = t;
  }, [t]);
  const userInfo = getUserInfo();
  const staffUserId = isPortalRole(userInfo?.role) ? userInfo?.userId ?? null : null;
  const [session, setSession] = useState<CallSession | null>(null);
  const sessionRef = useRef<CallSession | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingLocalCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const localDescriptionSentRef = useRef(false);
  const ringingTimerRef = useRef<number | null>(null);
  const connectionTimerRef = useRef<number | null>(null);

  const updateSession = useCallback((next: CallSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const updateCall = useCallback((status: CallStatus, error?: string) => {
    const current = sessionRef.current;
    if (current) updateSession({ ...current, status, error });
  }, [updateSession]);

  const clearTimers = useCallback(() => {
    if (ringingTimerRef.current !== null) window.clearTimeout(ringingTimerRef.current);
    if (connectionTimerRef.current !== null) window.clearTimeout(connectionTimerRef.current);
    ringingTimerRef.current = null;
    connectionTimerRef.current = null;
  }, []);

  const stopMedia = useCallback(() => {
    clearTimers();
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingRemoteCandidatesRef.current = [];
    pendingLocalCandidatesRef.current = [];
    localDescriptionSentRef.current = false;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, [clearTimers]);

  const createPeerConnection = useCallback((current: CallSession, iceServers: RTCIceServer[]) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: iceServers.length > 0 ? iceServers : [
        { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
        {
          urls: [
            'turn:openrelay.metered.ca:80?transport=udp',
            'turn:openrelay.metered.ca:80?transport=tcp',
            'turn:openrelay.metered.ca:443?transport=tcp',
            'turns:openrelay.metered.ca:443?transport=tcp',
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
    });
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    peerConnectionRef.current = peerConnection;
    peerConnection.ontrack = (event) => {
      const tracks = event.streams.flatMap((stream) => stream.getTracks());
      if (!tracks.some((track) => track.id === event.track.id)) tracks.push(event.track);
      tracks.forEach((track) => {
        if (!remoteStream.getTracks().some((existing) => existing.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
    };
    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      const active = sessionRef.current;
      if (!active || active.callId !== current.callId) return;
      if (!localDescriptionSentRef.current) {
        pendingLocalCandidatesRef.current.push(event.candidate);
      } else {
        void signalingService.sendIceCandidate(active.callId, active.remoteUserId, event.candidate)
          .catch((error: unknown) => console.warn('Failed to send staff call ICE candidate', error));
      }
    };
    const markConnected = () => {
      if (peerConnection.connectionState === 'connected'
        || peerConnection.iceConnectionState === 'connected'
        || peerConnection.iceConnectionState === 'completed') {
        clearTimers();
        updateCall('active');
      } else if (peerConnection.connectionState === 'failed') {
        stopMedia();
        updateCall('failed', translationRef.current('Medieforbindelsen feilet.'));
      }
    };
    peerConnection.onconnectionstatechange = markConnected;
    peerConnection.oniceconnectionstatechange = markConnected;
    return peerConnection;
  }, [clearTimers, stopMedia, updateCall]);

  const sendQueuedLocalCandidates = useCallback(async (current: CallSession) => {
    localDescriptionSentRef.current = true;
    const candidates = pendingLocalCandidatesRef.current;
    pendingLocalCandidatesRef.current = [];
    for (const candidate of candidates) {
      await signalingService.sendIceCandidate(current.callId, current.remoteUserId, candidate);
    }
  }, []);

  const onOffer = useCallback((payload: unknown) => {
    if (!isObject(payload)) return;
    const value = payload as CallOfferPayload;
    if (typeof value.callId !== 'string' || typeof value.callerId !== 'string'
      || typeof value.sdp !== 'string' || !value.sdp) return;
    const active = sessionRef.current;
    if (active || signalingService.getCurrentCallId()) {
      void signalingService.sendCallRejected(value.callId, value.callerId, 'busy')
        .catch((error: unknown) => console.warn('Failed to reject busy staff call', error));
      return;
    }

    const incoming: CallSession = {
      callId: value.callId,
      direction: 'incoming',
      remoteUserId: value.callerId,
      remoteName: typeof value.callerName === 'string' ? value.callerName : translationRef.current('Sykepleier'),
      mediaType: value.mediaType === 'video' ? 'video' : 'audio',
      status: 'incoming',
      sdp: value.sdp,
    };
    pendingRemoteCandidatesRef.current = [];
    updateSession(incoming);
    signalingService.setCurrentCallId(incoming.callId);
  }, [updateSession]);

  const onIceCandidate = useCallback(async (payload: unknown) => {
    const active = sessionRef.current;
    if (!active || !isObject(payload) || payload.callId !== active.callId
      || typeof payload.candidate !== 'string') return;
    const candidate: RTCIceCandidateInit = {
      candidate: payload.candidate,
      sdpMid: typeof payload.sdpMid === 'string' ? payload.sdpMid : null,
      sdpMLineIndex: typeof payload.sdpMLineIndex === 'number' ? payload.sdpMLineIndex : null,
    };
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection?.remoteDescription) {
      pendingRemoteCandidatesRef.current.push(candidate);
      return;
    }
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.warn('Could not add staff call ICE candidate', error);
    }
  }, []);

  const onCallAnswer = useCallback(async (payload: unknown) => {
    const active = sessionRef.current;
    if (!active || active.direction !== 'outgoing' || !isObject(payload)
      || payload.callId !== active.callId || typeof payload.sdp !== 'string') return;
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection) return;
    try {
      updateCall('connecting');
      await peerConnection.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      for (const candidate of pendingRemoteCandidatesRef.current) {
        await peerConnection.addIceCandidate(candidate);
      }
      pendingRemoteCandidatesRef.current = [];
      connectionTimerRef.current = window.setTimeout(() => {
        if (sessionRef.current?.callId === active.callId
          && sessionRef.current.status === 'connecting') {
          stopMedia();
          updateCall('failed', translationRef.current('Medieforbindelsen feilet.'));
        }
      }, 30_000);
    } catch (error) {
      console.error('Could not apply staff call answer', error);
      stopMedia();
      updateCall('failed', translationRef.current('Medieforbindelsen feilet.'));
    }
  }, [stopMedia, updateCall]);

  const onCallRejected = useCallback((payload: unknown) => {
    const active = sessionRef.current;
    if (!active || !isObject(payload) || payload.callId !== active.callId) return;
    stopMedia();
    updateCall('ended', payload.reason === 'busy'
      ? translationRef.current('Mottakeren er opptatt.')
      : translationRef.current('Anropet ble avvist.'));
  }, [stopMedia, updateCall]);

  const onCallEnded = useCallback((payload: unknown) => {
    const active = sessionRef.current;
    if (!active || !isObject(payload) || payload.callId !== active.callId) return;
    stopMedia();
    updateCall('ended', payload.reason === 'no_answer'
      ? translationRef.current('Ingen svarte på anropet.')
      : translationRef.current('Anropet ble avsluttet.'));
  }, [stopMedia, updateCall]);

  useEffect(() => {
    if (!staffUserId || !isSupabaseConfigured) return;
    signalingService.on('call_offer', onOffer);
    signalingService.on('ice_candidate', onIceCandidate);
    signalingService.on('call_answer', onCallAnswer);
    signalingService.on('call_rejected', onCallRejected);
    signalingService.on('call_ended', onCallEnded);
    void signalingService.initialize(staffUserId).catch((error: unknown) => {
      signalingService.disconnect();
      console.error('Could not initialize staff calling', error);
    });
    return () => {
      signalingService.off('call_offer', onOffer);
      signalingService.off('ice_candidate', onIceCandidate);
      signalingService.off('call_answer', onCallAnswer);
      signalingService.off('call_rejected', onCallRejected);
      signalingService.off('call_ended', onCallEnded);
      signalingService.setCurrentCallId(null);
      signalingService.disconnect();
      stopMedia();
    };
  }, [onCallAnswer, onCallEnded, onCallRejected, onIceCandidate, onOffer, staffUserId, stopMedia]);

  const callNurse = useCallback((recipient: CallRecipient, mediaType: StaffCallMediaType) => {
    if (!staffUserId || sessionRef.current || recipient.id === staffUserId) return;
    const callId = globalThis.crypto?.randomUUID?.()
      ?? `call_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const outgoing: CallSession = {
      callId,
      direction: 'outgoing',
      remoteUserId: recipient.id,
      remoteName: recipient.fullName,
      mediaType,
      status: 'calling',
    };
    updateSession(outgoing);
    pendingRemoteCandidatesRef.current = [];

    void (async () => {
      try {
        await signalingService.initialize(staffUserId, callId);
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: mediaType === 'video' ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
          } : false,
        });
        localStreamRef.current = stream;
        const iceServers = await signalingService.getManagedIceServers();
        const peerConnection = createPeerConnection(outgoing, iceServers);
        stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        if (!offer.sdp) throw new Error('Browser did not create an SDP offer');
        await signalingService.sendCallOffer(
          callId,
          recipient.id,
          staffUserId,
          userInfo?.fullName ?? translationRef.current('Sykepleier'),
          offer.sdp,
          mediaType,
        );
        await sendQueuedLocalCandidates(outgoing);
        window.setTimeout(() => {
          if (sessionRef.current?.callId === callId
            && sessionRef.current.status === 'calling') updateCall('ringing');
        }, 1_500);
        ringingTimerRef.current = window.setTimeout(() => {
          if (sessionRef.current?.callId !== callId
            || !['calling', 'ringing'].includes(sessionRef.current.status)) return;
          void signalingService.sendCallEnded(callId, recipient.id, 'no_answer');
          stopMedia();
          updateCall('ended', translationRef.current('Ingen svarte på anropet.'));
        }, 60_000);
      } catch (error) {
        console.error('Could not start staff call', error);
        stopMedia();
        updateCall('failed', error instanceof DOMException
          ? translationRef.current('Kunne ikke starte mikrofonen eller kameraet.')
          : !isSupabaseConfigured
            ? translationRef.current('ViKom-anrop er ikke konfigurert.')
            : translationRef.current('Anropet kunne ikke startes.'));
      }
    })();
  }, [createPeerConnection, sendQueuedLocalCandidates, staffUserId, stopMedia, updateCall, updateSession, userInfo?.fullName]);

  const acceptIncomingCall = useCallback(() => {
    const incoming = sessionRef.current;
    if (!incoming || incoming.direction !== 'incoming' || incoming.status !== 'incoming') return;
    updateCall('connecting');
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: incoming.mediaType === 'video' ? {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 30 },
          } : false,
        });
        localStreamRef.current = stream;
        const iceServers = await signalingService.getManagedIceServers();
        const peerConnection = createPeerConnection(incoming, iceServers);
        stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        await peerConnection.setRemoteDescription({ type: 'offer', sdp: incoming.sdp ?? '' });
        for (const candidate of pendingRemoteCandidatesRef.current) {
          await peerConnection.addIceCandidate(candidate);
        }
        pendingRemoteCandidatesRef.current = [];
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        if (!answer.sdp) throw new Error('Browser did not create an SDP answer');
        await signalingService.sendCallAnswer(incoming.callId, incoming.remoteUserId, answer.sdp);
        await sendQueuedLocalCandidates(incoming);
        connectionTimerRef.current = window.setTimeout(() => {
          if (sessionRef.current?.callId === incoming.callId
            && sessionRef.current.status === 'connecting') {
            stopMedia();
            updateCall('failed', translationRef.current('Medieforbindelsen feilet.'));
          }
        }, 30_000);
      } catch (error) {
        console.error('Could not accept staff call', error);
        try {
          await signalingService.sendCallRejected(
            incoming.callId,
            incoming.remoteUserId,
            'media_unavailable',
          );
        } catch (signalError) {
          console.error('Could not notify caller that media is unavailable', signalError);
        }
        stopMedia();
        updateCall('failed', error instanceof DOMException
          ? translationRef.current('Kunne ikke starte mikrofonen eller kameraet.')
          : !isSupabaseConfigured
            ? translationRef.current('ViKom-anrop er ikke konfigurert.')
            : translationRef.current('Anropet kunne ikke startes.'));
      }
    })();
  }, [createPeerConnection, sendQueuedLocalCandidates, stopMedia, updateCall]);

  const declineIncomingCall = useCallback(() => {
    const incoming = sessionRef.current;
    if (!incoming || incoming.direction !== 'incoming' || incoming.status !== 'incoming') return;
    void signalingService.sendCallRejected(incoming.callId, incoming.remoteUserId, 'declined')
      .catch((error: unknown) => console.error('Could not decline staff call', error));
    stopMedia();
    updateSession(null);
    signalingService.setCurrentCallId(null);
  }, [stopMedia, updateSession]);

  const hangUp = useCallback(() => {
    const active = sessionRef.current;
    if (!active) return;
    if (['calling', 'ringing', 'connecting', 'active'].includes(active.status)) {
      void signalingService.sendCallEnded(
        active.callId,
        active.remoteUserId,
        active.status === 'active' ? 'user_hung_up' : 'caller_cancelled',
      ).catch((error: unknown) => console.warn('Could not end staff call', error));
    }
    stopMedia();
    if (active.status === 'incoming') {
      updateSession(null);
      signalingService.setCurrentCallId(null);
    } else {
      updateCall('ended', translationRef.current('Anropet ble avsluttet.'));
    }
  }, [stopMedia, updateCall, updateSession]);

  const closeCall = useCallback(() => {
    stopMedia();
    updateSession(null);
    signalingService.setCurrentCallId(null);
  }, [stopMedia, updateSession]);

  const contextValue: StaffCallingContextValue = {
    callNurse,
    isBusy: session !== null,
  };

  const isLive = session !== null
    && ['calling', 'ringing', 'connecting', 'active'].includes(session.status);

  return (
    <StaffCallingContext.Provider value={contextValue}>
      {children}
      <Modal
        show={session !== null}
        onHide={isLive ? hangUp : closeCall}
        centered
        size="lg"
        backdrop="static"
        keyboard={false}
      >
        {session && (
          <>
            <Modal.Header>
              <Modal.Title>{session.direction === 'incoming'
                ? t('Anrop fra {{name}}', { name: session.remoteName })
                : t('Samtale med {{name}}', { name: session.remoteName })}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="text-center">
              {session.status === 'incoming' ? (
                <>
                  <i className={`bi ${session.mediaType === 'video' ? 'bi-camera-video' : 'bi-telephone-inbound'} display-1 text-primary`} aria-hidden="true"></i>
                  <p className="mt-3 mb-0">{session.mediaType === 'video'
                    ? t('Innkommende videoanrop')
                    : t('Innkommende lydanrop')}</p>
                </>
              ) : session.status === 'active' ? (
                <>
                  {session.mediaType === 'video' ? (
                    <div className="position-relative bg-dark rounded overflow-hidden mb-3" style={{ minHeight: 260 }}>
                      <video
                        ref={(element) => {
                          remoteVideoRef.current = element;
                          if (element && remoteStreamRef.current) element.srcObject = remoteStreamRef.current;
                        }}
                        autoPlay
                        playsInline
                        className="w-100 h-100 object-fit-cover"
                        aria-label={t('Video fra {{name}}', { name: session.remoteName })}
                      />
                      <video
                        ref={(element) => {
                          localVideoRef.current = element;
                          if (element && localStreamRef.current) element.srcObject = localStreamRef.current;
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="position-absolute bottom-0 end-0 m-2 rounded border border-light object-fit-cover"
                        style={{ width: 120, height: 90 }}
                        aria-label={t('Din video')}
                      />
                    </div>
                  ) : (
                    <div className="py-4 mb-3">
                      <audio
                        ref={(element) => {
                          remoteAudioRef.current = element;
                          if (element && remoteStreamRef.current) element.srcObject = remoteStreamRef.current;
                        }}
                        autoPlay
                        aria-label={t('Lyd fra {{name}}', { name: session.remoteName })}
                      />
                      <i className="bi bi-telephone-fill display-1 text-success" aria-hidden="true"></i>
                    </div>
                  )}
                  <h4 className="text-success mb-0">{t('Anrop pågår!')}</h4>
                </>
              ) : ['calling', 'ringing', 'connecting'].includes(session.status) ? (
                <>
                  <Spinner animation="grow" variant="primary" className="mb-3" />
                  <p>{session.status === 'connecting'
                    ? t('Kobler opp...')
                    : t('Ringer {{name}}...', { name: session.remoteName })}</p>
                </>
              ) : (
                <Alert variant={session.status === 'failed' ? 'danger' : 'warning'}>
                  {session.error ?? t('Anropet ble avsluttet.')}
                </Alert>
              )}
            </Modal.Body>
            <Modal.Footer>
              {session.status === 'incoming' ? (
                <div className="d-flex gap-2 w-100">
                  <Button variant="success" className="flex-grow-1" onClick={acceptIncomingCall}>
                    <i className="bi bi-telephone-inbound me-2" aria-hidden="true"></i>{t('Svar på anrop')}
                  </Button>
                  <Button variant="danger" className="flex-grow-1" onClick={declineIncomingCall}>
                    <i className="bi bi-telephone-x me-2" aria-hidden="true"></i>{t('Avslå anrop')}
                  </Button>
                </div>
              ) : isLive ? (
                <Button variant="danger" className="w-100" onClick={hangUp}>{t('Avslutt samtale')}</Button>
              ) : (
                <Button variant="secondary" className="w-100" onClick={closeCall}>{t('Lukk vindu')}</Button>
              )}
            </Modal.Footer>
          </>
        )}
      </Modal>
    </StaffCallingContext.Provider>
  );
};

export default StaffCallProvider;
