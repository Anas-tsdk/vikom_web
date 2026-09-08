import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Spinner, Alert } from 'react-bootstrap';
import { signalingService } from '../../services/SupabaseSignalingService';
import { getUserInfo } from '../../auth/AuthService';
import PatientService from '../../patients/services/PatientService';
import VisitService from '../../visits/services/VisitService';

export type CallState = 'Idle' | 'Calling' | 'Ringing' | 'Accepted' | 'Declined' | 'Ended' | 'Failed';

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
}

const CallModal: React.FC<CallModalProps> = ({ show, onHide, targetSupabaseProfileId, patientId, patientName, visitId, onOutcome }) => {
  const [callState, setCallState] = useState<CallState>('Idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

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

  useEffect(() => {
    if (!show) return;

    // Listen for call answers
    const onCallAnswer = (payload: any) => {
      console.log('Call answered:', payload);
      outcomeRef.current = 'Answered';
      setCallState('Accepted');
      updateCallStatus('Answered');
    };

    // Listen for call rejections
    const onCallRejected = (payload: any) => {
      console.log('Call rejected:', payload);
      if (outcomeRef.current !== 'Answered') outcomeRef.current = 'Declined';
      setCallState('Declined');
      setErrorMessage(payload?.reason || 'Pasienten avviste anropet.');
      updateCallStatus('Declined');
    };

    // Listen for call endings
    const onCallEnded = (payload: any) => {
      console.log('Call ended:', payload);
      const previous = callStateRef.current;
      setCallState('Ended');
      if (previous !== 'Accepted' && previous !== 'Declined') {
        setErrorMessage(payload?.reason || 'Anropet ble avsluttet.');
      }
      // Don't clobber an already-recorded terminal outcome (e.g. a decline that
      // the TV follows up with a call_ended).
      if (previous !== 'Declined') {
        updateCallStatus('Ended');
      }
    };

    // Register listeners BEFORE sending the offer so a fast answer/rejection
    // from the TV can't arrive before we're listening for it.
    signalingService.on('call_answer', onCallAnswer);
    signalingService.on('call_rejected', onCallRejected);
    signalingService.on('call_ended', onCallEnded);

    // Reset state when modal opens, then place the call.
    callLogIdRef.current = null;
    callLogCreateRef.current = null;
    outcomeRef.current = null;
    setCallState('Calling');
    setErrorMessage('');
    initiateCall();

    return () => {
      signalingService.off('call_answer', onCallAnswer);
      signalingService.off('call_rejected', onCallRejected);
      signalingService.off('call_ended', onCallEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const initiateCall = async () => {
    if (!targetSupabaseProfileId) {
      outcomeRef.current = 'Failed';
      setCallState('Failed');
      setErrorMessage('Pasienten har ikke en gyldig TV-profil (Supabase ID) koblet til seg.');
      return;
    }

    if (!userInfo || !userInfo.userId) {
      outcomeRef.current = 'Failed';
      setCallState('Failed');
      setErrorMessage('Kunne ikke hente din brukerinformasjon.');
      return;
    }

    try {
      // Ensure signaling is initialized
      signalingService.initialize(userInfo.userId);

      // Send the offer
      await signalingService.sendCallOffer(
        targetSupabaseProfileId,
        userInfo.userId,
        userInfo.fullName || 'Helsepersonell'
      );

      // Record the call attempt (best-effort; never block the call flow). We
      // keep the promise so a fast outcome can await it before updating. A
      // visit-scoped call is logged against the visit (carrying the attempt
      // number); a plain patient call uses the patient call log.
      if (visitId) {
        callLogCreateRef.current = (async () => {
          try {
            const attempt = await VisitService.logCallAttempt(visitId, { status: 'Initiated' });
            callLogIdRef.current = attempt.id;
          } catch (e) {
            console.warn('Failed to log visit call attempt', e);
          }
        })();
      } else if (patientId) {
        callLogCreateRef.current = (async () => {
          try {
            const logged = await PatientService.createCall(patientId);
            callLogIdRef.current = logged.id;
          } catch (e) {
            console.warn('Failed to log call', e);
          }
        })();
      }

      // Wait a moment before showing "Ringing" state
      setTimeout(() => {
        setCallState(current => current === 'Calling' ? 'Ringing' : current);
      }, 1500);

    } catch (e) {
      console.error('Anrop feilet:', e);
      outcomeRef.current = 'Failed';
      setCallState('Failed');
      setErrorMessage('En systemfeil oppstod ved forsøk på å ringe pasienten.');
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
        await signalingService.sendCallEnded(targetSupabaseProfileId, reason);
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
            <h4 className="mb-3">{callState === 'Failed' ? 'Anrop feilet' : 'Anrop avsluttet/avvist'}</h4>
            <Alert variant={callState === 'Failed' ? 'danger' : 'warning'}>{errorMessage}</Alert>
          </div>
        );
      
      case 'Accepted':
        return (
          <div className="text-center py-4">
            <i className="bi bi-telephone-fill text-success display-1 mb-3"></i>
            <h4 className="text-success mb-3">Anrop pågår!</h4>
            <p className="text-muted">Aktiv videosamtale simuleres... (Dummy POC flow)</p>
          </div>
        );

      case 'Calling':
      case 'Ringing':
      default:
        return (
          <div className="text-center py-4">
            <Spinner animation="grow" variant="primary" className="mb-4" style={{ width: '4rem', height: '4rem' }} />
            <h4>{callState === 'Calling' ? 'Kobler opp...' : `Ringer ${patientName}...`}</h4>
            <p className="text-muted mt-2">Venter på svar fra TV-skjermen...</p>
          </div>
        );
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered backdrop="static" keyboard={false}>
      <Modal.Header>
        <Modal.Title>Anrop til pasient</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {renderContent()}
      </Modal.Body>
      <Modal.Footer>
        {(callState === 'Calling' || callState === 'Ringing') ? (
          <Button variant="danger" onClick={handleClose} className="w-100 py-2 fw-semibold">
            Legg på
          </Button>
        ) : callState === 'Accepted' ? (
          <Button variant="danger" onClick={handleClose} className="w-100 py-2 fw-semibold">
            Avslutt samtale
          </Button>
        ) : (
          <Button variant="secondary" onClick={handleClose} className="w-100 py-2">
            Lukk vindu
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default CallModal;