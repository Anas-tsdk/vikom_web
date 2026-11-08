import { createContext, useContext } from 'react';

export type StaffCallMediaType = 'audio' | 'video';

export interface CallRecipient {
  id: string;
  fullName: string;
}

export interface StaffCallingContextValue {
  callNurse: (recipient: CallRecipient, mediaType: StaffCallMediaType) => void;
  isBusy: boolean;
}

export const StaffCallingContext = createContext<StaffCallingContextValue | null>(null);

export const useStaffCalling = (): StaffCallingContextValue => {
  const context = useContext(StaffCallingContext);
  if (!context) throw new Error('useStaffCalling must be used within StaffCallProvider');
  return context;
};
