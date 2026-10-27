import i18n from 'i18next';
import type { TFunction } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { english, german, norwegian } from './resources';
import { finnish } from './finnish';
import { swedish } from './swedish';
import { french } from './french';
import { dutch } from './dutch';

export const supportedLanguages = ['no', 'en', 'de', 'fi', 'sv', 'fr', 'nl'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const LANGUAGE_STORAGE_KEY = 'vikom-language';

const isSupportedLanguage = (value: string | null): value is SupportedLanguage =>
  supportedLanguages.includes(value as SupportedLanguage);

const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
const initialLanguage: SupportedLanguage = isSupportedLanguage(storedLanguage)
  ? storedLanguage
  : 'no';

void i18n.use(initReactI18next).init({
  resources: {
    no: { translation: norwegian },
    en: { translation: english },
    de: { translation: german },
    fi: { translation: finnish },
    sv: { translation: swedish },
    fr: { translation: french },
    nl: { translation: dutch },
  },
  lng: initialLanguage,
  fallbackLng: 'no',
  supportedLngs: [...supportedLanguages],
  keySeparator: false,
  nsSeparator: false,
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

const applyDocumentLanguage = (language: string) => {
  const normalized = isSupportedLanguage(language) ? language : 'no';
  document.documentElement.lang = normalized === 'no' ? 'nb' : normalized;
};

applyDocumentLanguage(initialLanguage);

i18n.on('languageChanged', (language) => {
  const normalized = isSupportedLanguage(language) ? language : 'no';
  localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  applyDocumentLanguage(normalized);
});

export const localeForLanguage = (language = i18n.resolvedLanguage): string => {
  switch (language) {
    case 'de':
      return 'de-DE';
    case 'en':
      return 'en-GB';
    case 'fi':
      return 'fi-FI';
    case 'sv':
      return 'sv-SE';
    case 'fr':
      return 'fr-FR';
    case 'nl':
      return 'nl-NL';
    default:
      return 'nb-NO';
  }
};

export const translateApiMessage = (t: TFunction, message: string): string => {
  const normalizedMessage = message.trim().replace(/^"(.*)"$/, '$1');
  const linkedProfile = normalizedMessage.match(/^Supabase-profilen er allerede koblet til (.+)\.$/);
  if (linkedProfile) {
    return t('Supabase-profilen er allerede koblet til {{name}}.', { name: linkedProfile[1] });
  }

  const apiMessageKeys: Record<string, string> = {
    'ingen ledig tid hos sykepleieren passer med det foreslåtte tidspunktet':
      'No available nurse slot fits the proposed time',
    'sykepleieren eller pasienten har allerede en overlappende avtale':
      'The nurse or patient already has an overlapping appointment',
  };
  const normalizedKey = apiMessageKeys[normalizedMessage.replace(/[.!?]+$/, '').toLowerCase()];
  return t(normalizedKey ?? normalizedMessage);
};

export default i18n;
