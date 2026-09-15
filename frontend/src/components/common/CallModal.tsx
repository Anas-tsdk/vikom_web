import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Spinner, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { signalingService } from '../../services/SupabaseSignalingService';
import { getUserInfo } from '../../auth/AuthService';
import PatientService from '../../patients/services/PatientService';
import VisitService from '../../visits/services/VisitService';

export type CallState = 'Idle' | 'Calling' | 'Ringing' | 'Connecting' | 'Accepted' | 'Declined' | 'Ended' | 'Failed';

/** Coarse result of a call, reported to the visit workspace via onOutcome. */
export type CallOutcome = 'Answered' | 'Declined' | 'Missed' | 'Failed';

interface CallModalProps {
  show: boolean;
  onHide: () => void;
  targetSupabaseProfileId?: string | null;
  patientId?: string;
  patientName: string;
  /** When set, the call is logged as an attempt of this visit. */
  visitId?: number;
  /** Reports the final outcome after the modal closes (used by the visit page). */
  onOutcome?: (outcome: CallOutcome) => void;
  mediaType?: 'audio' | 'video';
}

const CallModal: React.FC<CallModalProps> = ({
  show,
  onHide,
  targetSupabaseProfileId,
  patientId,
  patientName,
  visitId,
  onOutcome,
  mediaType = 'video',
}) => {
  const { t } = useTranslation();
  const [callState, setCallState] = useState<CallState>('Idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [activeMediaType, setActiveMediaType] = useState<'audio' | 'video'>(mediaType);
  const [videoUpgradePrompt, setVideoUpgradePrompt] = useState(false);
  const [videoUpgradeWaiting, setVideoUpgradeWaiting] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const queuedIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const ringingTimeoutRef = useRef<number | null>(null);
  const connectingTimeoutRef = useRef<number | null>(null);
  const mediaConnectionTimeoutRef = useRef<number | null>(null);
  const callIdRef = useRef<string>('');

  // Best-known final outcome of this call, reported on close.
  const outcomeRef = useRef<CallOutcome | null>(null);

  // Mirror callState in a ref so the signaling listeners (registered once per
  // open) always read the latest value without relying on a stale closure.
  const callStateRef = useRef<CallState>(callState);
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Id of the CallLog row created for the in-progress call, so its outcome
  // can be updated as the call state changes.
  const callLogIdRef = useRef<number | null>(null);
  // The in-flight create request, so an outcome that arrives before the create
  // resolves (e.g. a near-instant answer) still updates the right row.
  const callLogCreateRef = useRef<Promise<void> | null>(null);

  const userInfo = getUserInfo();

  const stopMediaAndPeerConnection = () => {
    if (ringingTimeoutRef.current !== null) {
      window.clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }
    if (connectingTimeoutRef.current !== null) {
      window.clearTimeout(connectingTimeoutRef.current);
      connectingTimeoutRef.current = null;
    }
    if (mediaConnectionTimeoutRef.current !== null) {
      window.clearTimeout(mediaConnectionTimeoutRef.current);
      mediaConnectionTimeoutRef.current = null;
    }
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    queuedIceCandidatesRef.current = [];
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  };

  // Persist the outcome of the currently-logged call (best-effort; a logging
  // failure must never interfere with the actual call flow).
  const updateCallStatus = async (status: string) => {
    if (!patientId) return;
    // Make sure the create has settled so callLogIdRef is populated.
    if (callLogCreateRef.current) {
      await callLogCreateRef.current;
    }
    if (callLogIdRef.current === null) return;
    try {
      await PatientService.updateCall(patientId, callLogIdRef.current, status);
    } catch (e) {
      console.warn('Failed to update call log status', e);
    }
  };

  const markMediaConnected = () => {
    if (mediaConnectionTimeoutRef.current !== null) {
      window.clearTimeout(mediaConnectionTimeoutRef.current);
      mediaConnectionTimeoutRef.current = null;
    }
    if (ringingTimeoutRef.current !== null) {
      window.clearTimeout(ringingTimeoutRef.current);
      ringingTimeoutRef.current = null;
    }
    if (connectingTimeoutRef.current !== null) {
      window.clearTimeout(connectingTimeoutRef.current);
      connectingTimeoutRef.current = null;
    }
    if (outcomeRef.current !== 'Answered') {
      outcomeRef.current = 'Answered';
      void updateCallStatus('Answered');
    }
    setCallState('Accepted');
  };

  const failMediaConnection = () => {
    if (outcomeRef.current === 'Answered') return;
    outcomeRef.current = 'Failed';
    setCallState('Failed');
    setErrorMessage(t('Medieforbindelsen til TV-skjermen feilet.'));
    void updateCallStatus('Failed');
    stopMediaAndPeerConnection();
  };

  /**
   * Audio calls reserve a send/receive video transceiver when the offer is
   * created. Replacing that empty sender with a camera track therefore upgrades
   * an established call without SDP renegotiation or a second call.
   */
  const enableLocalVideo = async () => {
    const peerConnection = peerConnectionRef.current;
    if (!peerConnection) throw new Error('The call is no longer connected');
    if (localStreamRef.current?.getVideoTracks().some((track) => track.readyState === 'live')) {
      setActiveMediaType('video');
      return;
    }

    const cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
    const cameraTrack = cameraStream.getVideoTracks()[0];
    if (!cameraTrack) throw new Error('No camera is available');
    const videoTransceiver = peerConnection.getTransceivers().find(
      (transceiver) => transceiver.receiver.track.kind === 'video',
    );
    if (!videoTransceiver) {
      cameraTrack.stop();
      throw new Error('This call was not prepared for a video upgrade');
    }
    await videoTransceiver.sender.replaceTrack(cameraTrack);
    videoTransceiver.direction = 'sendrecv';
    localStreamRef.current?.addTrack(cameraTrack);
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    setActiveMediaType('video');
  };

  useEffect(() => {
    if (!show) return;

    // Listen for call answers
    const onCallAnswer = async (payload: unknown) => {
      console.log('Call answered:', payload);
      try {
        const answer = payload && typeof payload === 'object' && 'sdp' in payload
          ? (payload as { sdp?: unknown }).sdp
          : undefined;
        if (typeof answer !== 'string' || !peerConnectionRef.current) {
          throw new Error('The TV returned an invalid call answer');
        }
        // An SDP answer only confirms that the patient pressed Accept. Do not
        // claim that the call is connected until ICE has established a real
        // audio/video path (important when the peers are on different NATs).
        if (ringingTimeoutRef.current !== null) {
          window.clearTimeout(ringingTimeoutRef.current);
          ringingTimeoutRef.current = null;
        }
        setCallState('Connecting');
        await peerConnectionRef.current.setRemoteDescription({ type: 'answer', sdp: answer });
        for (const candidate of queuedIceCandidatesRef.current) {
          await peerConnectionRef.current.addIceCandidate(candidate);
        }
        queuedIceCandidatesRef.current = [];
        if (peerConnectionRef.current.connectionState === 'connected'
          || peerConnectionRef.current.iceConnectionState === 'connected'
          || peerConnectionRef.current.iceConnectionState === 'completed') {
          markMediaConnected();
        } else {
          mediaConnectionTimeoutRef.current = window.setTimeout(failMediaConnection, 30_000);
        }
      } catch (error) {
        console.error('Could not apply the TV call answer:', error);
        outcomeRef.current = 'Failed';
        setCallState('Failed');
        setErrorMessage(t('Kunne ikke opprette medieforbindelsen til TV-skjermen.'));
        void updateCallStatus('Failed');
      }
    };

    const onIceCandidate = async (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const value = payload as { candidate?: unknown; sdpMid?: unknown; sdpMLineIndex?: unknown };
      if (typeof value.candidate !== 'string' || !peerConnectionRef.current) return;
      const candidate: RTCIceCandidateInit = {
        candidate: value.candidate,
        sdpMid: typeof value.sdpMid === 'string' ? value.sdpMid : null,
        sdpMLineIndex: typeof value.sdpMLineIndex === 'number' ? value.sdpMLineIndex : null,
      };
      try {
        if (peerConnectionRef.current.remoteDescription) {
          await peerConnectionRef.current.addIceCandidate(candidate);
        } else {
          queuedIceCandidatesRef.current.push(candidate);
        }
      } catch (error) {
        console.warn('Could not add remote ICE candidate', error);
      }
    };

    // Listen for call rejections
    const onCallRejected = (payload: unknown) => {
      console.log('Call rejected:', payload);
      if (outcomeRef.current !== 'Answered') outcomeRef.current = 'Declined';
      setCallState('Declined');
      const reason = payload && typeof payload === 'object' && 'reason' in payload
        ? (payload as { reason?: unknown }).reason
        : undefined;
      setErrorMessage(typeof reason === 'string' ? reason : t('Pasienten avviste anropet.'));
      stopMediaAndPeerConnection();
      void updateCallStatus('Declined');
    };

    // Listen for call endings
    const onCallEnded = (payload: unknown) => {
      console.log('Call ended:', payload);
      const previous = callStateRef.current;
      setCallState('Ended');
      stopMediaAndPeerConnection();
      if (previous !== 'Accepted' && previous !== 'Declined') {
        const reason = payload && typeof payload === 'object' && 'reason' in payload
          ? (payload as { reason?: unknown }).reason
          : undefined;
        setErrorMessage(typeof reason === 'string' ? reason : t('Anropet ble avsluttet.'));
      }
      // Don't clobber an already-recorded terminal outcome (e.g. a decline that
      // the TV follows up with a call_ended).
      if (previous !== 'Declined') {
        void updateCallStatus('Ended');
      }
    };

    const onVideoUpgradeRequest = () => {
      if (callStateRef.current === 'Accepted') setVideoUpgradePrompt(true);
    };

    const onVideoUpgradeResponse = async (payload: unknown) => {
      const accepted = Boolean(
        payload && typeof payload === 'object' && 'accepted' in payload
          ? (payload as { accepted?: unknown }).accepted
          : false,
      );
      setVideoUpgradeWaiting(false);
      if (!accepted) return;
      try {
        await enableLocalVideo();
        if (targetSupabaseProfileId) {
          await signalingService.sendCameraState(callIdRef.current, targetSupabaseProfileId, true);
        }
      } catch (error) {
        console.error('Could not enable camera after video upgrade acceptance', error);
        setErrorMessage(t('Kameraet kunne ikke startes. Samtalen fortsetter med lyd.'));
      }
    };

    const onRemoteCameraState = (payload: unknown) => {
      const enabled = Boolean(
        payload && typeof payload === 'object' && 'enabled' in payload
          ? (payload as { enabled?: unknown }).enabled
          : false,
      );
      if (enabled) setActiveMediaType('video');
    };

    // Register listeners BEFORE sending the offer so a fast answer/rejection
    // from the TV can't arrive before we're listening for it.
    signalingService.on('call_answer', onCallAnswer);
    signalingService.on('ice_candidate', onIceCandidate);
    signalingService.on('call_rejected', onCallRejected);
    signalingService.on('call_ended', onCallEnded);
    signalingService.on('video_upgrade_request', onVideoUpgradeRequest);
    signalingService.on('video_upgrade_response', onVideoUpgradeResponse);
    signalingService.on('camera_state', onRemoteCameraState);

    // Reset state when modal opens, then place the call.
    callLogIdRef.current = null;
    callLogCreateRef.current = null;
    outcomeRef.current = null;
    setCallState('Calling');
    setErrorMessage('');
    setActiveMediaType(mediaType);
    setVideoUpgradePrompt(false);
    setVideoUpgradeWaiting(false);
    callIdRef.current = globalThis.crypto?.randomUUID?.()
      ?? `call_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    initiateCall();

    return () => {
      signalingService.off('call_answer', onCallAnswer);
      signalingService.off('ice_candidate', onIceCandidate);
      signalingService.off('call_rejected', onCallRejected);
      signalingService.off('call_ended', onCallEnded);
      signalingService.off('video_upgrade_request', onVideoUpgradeRequest);
      signalingService.off('video_upgrade_response', onVideoUpgradeResponse);
      signalingService.off('camera_state', onRemoteCameraState);
      stopMediaAndPeerConnection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const initiateCall = async () => {
    if (!targetSupabaseProfileId) {
      outcomeRef.current = 'Failed';
      setCallState('Failed');
      setErrorMessage(t('Pasienten har ikke en gyldig TV-profil (Supabase ID) koblet til seg.'));
      return;
    }

    if (!userInfo || !userInfo.userId) {
      outcomeRef.current = 'Failed';
      setCallState('Failed');
      setErrorMessage(t('Kunne ikke hente din brukerinformasjon.'));
      return;
    }

    try {
      // Start logging before the offer is broadcast. A TV can answer almost
      // instantly, and the answer handler must already have a row to update.
      if (visitId) {
        callLogCreateRef.current = (async () => {
          try {
            const attempt = await VisitService.logCallAttempt(visitId, { status: 'Initiated' });
            callLogIdRef.current = attempt.id;
          } catch (error) {
            console.warn('Failed to log visit call attempt', error);
          }
        })();
      } else if (patientId) {
        callLogCreateRef.current = (async () => {
          try {
            const logged = await PatientService.createCall(patientId);
            callLogIdRef.current = logged.id;
          } catch (error) {
            console.warn('Failed to log call', error);
          }
        })();
      }

      await signalingService.initialize(userInfo.userId, callIdRef.current);

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: mediaType === 'video' ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        } : false,
      });
      localStreamRef.current = localStream;

      const managedIceServers = await signalingService.getManagedIceServers();
      const peerConnection = new RTCPeerConnection({
        iceServers: managedIceServers.length > 0 ? managedIceServers : [
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
      peerConnectionRef.current = peerConnection;
      let offerSent = false;
      const pendingLocalCandidates: RTCIceCandidate[] = [];
      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
      if (mediaType === 'audio') {
        // Keep the call audio-only while still negotiating codecs for a later
        // two-sided camera upgrade. No camera permission is requested here.
        peerConnection.addTransceiver('video', { direction: 'sendrecv' });
      }

      peerConnection.ontrack = (event) => {
        // Android uses Unified Plan. Modern libwebrtc normally supplies a
        // MediaStream, but event.streams may legally be empty; in that case the
        // track itself still has to be attached or browser audio/video is lost.
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
        if (event.candidate) {
          if (!offerSent) {
            pendingLocalCandidates.push(event.candidate);
          } else {
            void signalingService.sendIceCandidate(callIdRef.current, targetSupabaseProfileId, event.candidate)
              .catch((error) => console.warn('Failed to send ICE candidate', error));
          }
        }
      };
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
          markMediaConnected();
        } else if (peerConnection.connectionState === 'failed'
          && mediaConnectionTimeoutRef.current === null) {
          // Late relay candidates can briefly recover a failed ICE check. Give
          // them a small grace period instead of tearing down immediately.
          mediaConnectionTimeoutRef.current = window.setTimeout(failMediaConnection, 5_000);
        }
      };
      peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'connected'
          || peerConnection.iceConnectionState === 'completed') {
          markMediaConnected();
        }
      };
      peerConnection.onicecandidateerror = (event) => {
        console.warn('ICE server candidate error', event.errorCode, event.errorText);
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      if (!offer.sdp) throw new Error('Browser did not create an SDP offer');

      await signalingService.sendCallOffer(
        callIdRef.current,
        targetSupabaseProfileId,
        userInfo.userId,
        userInfo.fullName || t('Helsepersonell'),
        offer.sdp,
        mediaType,
      );
      offerSent = true;
      for (const candidate of pendingLocalCandidates) {
        await signalingService.sendIceCandidate(callIdRef.current, targetSupabaseProfileId, candidate);
      }

      // Wait a moment before showing "Ringing" state
      connectingTimeoutRef.current = window.setTimeout(() => {
        setCallState(current => current === 'Calling' ? 'Ringing' : current);
      }, 1500);
      ringingTimeoutRef.current = window.setTimeout(() => {
        if (callStateRef.current === 'Calling' || callStateRef.current === 'Ringing') {
          outcomeRef.current = 'Missed';
          setCallState('Ended');
          setErrorMessage(t('Pasienten svarte ikke på anropet.'));
          void signalingService.sendCallEnded(callIdRef.current, targetSupabaseProfileId, 'no_answer');
          void updateCallStatus('Missed');
          stopMediaAndPeerConnection();
        }
      }, 60_000);

    } catch (e) {
      console.error('Anrop feilet:', e);
      stopMediaAndPeerConnection();
      signalingService.disconnect();
      outcomeRef.current = 'Failed';
      setCallState('Failed');
      const isMediaError = e instanceof DOMException && (
        e.name === 'NotAllowedError' || e.name === 'NotFoundError' || e.name === 'NotReadableError'
      );
      setErrorMessage(isMediaError
        ? mediaType === 'video'
          ? t('Gi nettleseren tilgang til mikrofon og kamera for å starte et videoanrop.')
          : t('Gi nettleseren tilgang til mikrofonen for å ringe.')
        : t('En systemfeil oppstod ved forsøk på å ringe pasienten.'));
      void updateCallStatus('Failed');
    }
  };

  const requestVideoUpgrade = async () => {
    if (!targetSupabaseProfileId || videoUpgradeWaiting) return;
    setVideoUpgradeWaiting(true);
    setErrorMessage('');
    try {
      await signalingService.requestVideoUpgrade(callIdRef.current, targetSupabaseProfileId);
    } catch (error) {
      console.warn('Could not request video upgrade', error);
      setVideoUpgradeWaiting(false);
      setErrorMessage(t('Kunne ikke be om video. Samtalen fortsetter med lyd.'));
    }
  };

  const answerVideoUpgrade = async (accepted: boolean) => {
    if (!targetSupabaseProfileId) return;
    setVideoUpgradePrompt(false);
    if (!accepted) {
      await signalingService.respondToVideoUpgrade(callIdRef.current, targetSupabaseProfileId, false);
      return;
    }
    try {
      await enableLocalVideo();
      await signalingService.respondToVideoUpgrade(callIdRef.current, targetSupabaseProfileId, true);
      await signalingService.sendCameraState(callIdRef.current, targetSupabaseProfileId, true);
    } catch (error) {
      console.error('Could not accept video upgrade', error);
      await signalingService.respondToVideoUpgrade(callIdRef.current, targetSupabaseProfileId, false);
      setErrorMessage(t('Kameraet kunne ikke startes. Samtalen fortsetter med lyd.'));
    }
  };

  const handleClose = async () => {
    // Notify the TV whenever we close while a call is still live: cancel a
    // ringing call, or hang up an accepted one. Already-terminated states
    // (Declined/Ended/Failed) need no further signal.
    const isLive = callState === 'Calling' || callState === 'Ringing' || callState === 'Accepted';
    if (isLive && targetSupabaseProfileId) {
      const reason = callState === 'Accepted' ? 'caller_hung_up' : 'caller_cancelled';
      try {
        await signalingService.sendCallEnded(callIdRef.current, targetSupabaseProfileId, reason);
      } catch (e) {
        console.warn('Failed to send call_ended', e);
      }
      // Record the final outcome: a hung-up accepted call vs. an unanswered one.
      await updateCallStatus(callState === 'Accepted' ? 'Ended' : 'Missed');
      // An accepted call that the nurse hangs up still counts as "reached".
      if (callState === 'Accepted') outcomeRef.current = 'Answered';
    }
    // Tear down the realtime subscription so it doesn't linger after the modal
    // closes; it is re-initialized on the next call.
    signalingService.disconnect();
    stopMediaAndPeerConnection();
    setCallState('Idle');
    // Report the outcome so a visit workspace can decide what to show next.
    onOutcome?.(outcomeRef.current ?? 'Missed');
    onHide();
  };

  const renderContent = () => {
    switch (callState) {
      case 'Failed':
      case 'Declined':
      case 'Ended':
        return (
          <div className="text-center py-4">
            <i className={`bi display-1 mb-3 ${callState === 'Failed' ? 'bi-x-circle text-danger' : 'bi-telephone-x text-warning'}`}></i>
            <h4 className="mb-3">{callState === 'Failed' ? t('Anrop feilet') : t('Anrop avsluttet/avvist')}</h4>
            <Alert variant={callState === 'Failed' ? 'danger' : 'warning'}>{errorMessage}</Alert>
          </div>
        );
      
      case 'Accepted':
        return (
          <div className="text-center py-3">
            {videoUpgradePrompt && (
              <Alert variant="info" className="text-start">
                <div className="fw-semibold mb-2">{t('{{name}} ønsker å bytte til video.', { name: patientName })}</div>
                <div className="d-flex gap-2">
                  <Button variant="primary" onClick={() => void answerVideoUpgrade(true)}>{t('Start video')}</Button>
                  <Button variant="outline-secondary" onClick={() => void answerVideoUpgrade(false)}>{t('Fortsett med lyd')}</Button>
                </div>
              </Alert>
            )}
            {activeMediaType === 'video' ? <div className="position-relative bg-dark rounded overflow-hidden mb-3" style={{ minHeight: 260 }}>
              <video
                ref={(element) => {
                  remoteVideoRef.current = element;
                  if (element && remoteStreamRef.current) element.srcObject = remoteStreamRef.current;
                }}
                autoPlay
                playsInline
                className="w-100 h-100 object-fit-cover"
                aria-label={t('Video fra {{name}}', { name: patientName })}
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
            </div> : (
              <div className="py-4 mb-3">
                <audio
                  ref={(element) => {
                    remoteAudioRef.current = element;
                    if (element && remoteStreamRef.current) element.srcObject = remoteStreamRef.current;
                  }}
                  autoPlay
                  aria-label={t('Lyd fra {{name}}', { name: patientName })}
                />
                <i className="bi bi-telephone-fill display-1 text-success" aria-hidden="true"></i>
              </div>
            )}
            <h4 className="text-success mb-3">{t('Anrop pågår!')}</h4>
            <p className="text-muted mb-0">{t('Du er koblet til {{name}}.', { name: patientName })}</p>
          </div>
        );

      case 'Calling':
      case 'Ringing':
      case 'Connecting':
      default:
        return (
          <div className="text-center py-4">
            <Spinner animation="grow" variant="primary" className="mb-4" style={{ width: '4rem', height: '4rem' }} />
            <h4>{callState === 'Connecting' || callState === 'Calling'
              ? t('Kobler opp...')
              : t('Ringer {{name}}...', { name: patientName })}</h4>
            <p className="text-muted mt-2">{t('Venter på svar fra TV-skjermen...')}</p>
          </div>
        );
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header>
        <Modal.Title>{activeMediaType === 'video' ? t('Videoanrop til pasient') : t('Anrop til pasient')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {renderContent()}
      </Modal.Body>
      <Modal.Footer>
        {(callState === 'Calling' || callState === 'Ringing' || callState === 'Connecting') ? (
          <Button variant="danger" onClick={handleClose} className="w-100 py-2 fw-semibold">
            {t('Legg på')}
          </Button>
        ) : callState === 'Accepted' ? (
          <div className="d-flex gap-2 w-100">
            {activeMediaType === 'audio' && (
              <Button
                variant="primary"
                onClick={() => void requestVideoUpgrade()}
                disabled={videoUpgradeWaiting}
                className="flex-grow-1 py-2 fw-semibold"
              >
                {videoUpgradeWaiting ? t('Venter på svar…') : t('Bytt til video')}
              </Button>
            )}
            <Button variant="danger" onClick={handleClose} className="flex-grow-1 py-2 fw-semibold">
              {t('Avslutt samtale')}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={handleClose} className="w-100 py-2">
            {t('Lukk vindu')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default CallModal;
