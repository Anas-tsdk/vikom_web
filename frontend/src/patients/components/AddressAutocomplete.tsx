import React, { useEffect, useId, useRef, useState } from 'react';
import { Form, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { searchAddresses, type AddressSuggestion } from '../services/AddressSearchService';

interface AddressAutocompleteProps {
  idPrefix: string;
  value: string;
  onChange: (address: string, latitude: number | null, longitude: number | null) => void;
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({ idPrefix, value, onChange }) => {
  const { t } = useTranslation();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setLoading(true);
        setLookupFailed(false);
        const matches = await searchAddresses(value, 7, controller.signal);
        setSuggestions(matches);
        setOpen(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setLookupFailed(true);
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [value]);

  const select = (suggestion: AddressSuggestion) => {
    skipNextSearch.current = true;
    onChange(suggestion.address, suggestion.latitude, suggestion.longitude);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <Form.Group className="mb-3 position-relative" controlId={`${idPrefix}Address`}>
      <Form.Label>{t('Adresse')}</Form.Label>
      <div className="position-relative">
        <Form.Control
          type="text"
          autoComplete="off"
          value={value}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          placeholder={t('Begynn å skrive en norsk gateadresse')}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(event) => onChange(event.target.value, null, null)}
        />
        {loading && <Spinner animation="border" size="sm" className="position-absolute top-50 end-0 translate-middle-y me-3" />}
      </div>
      {open && (
        <div id={listId} role="listbox" className="list-group position-absolute start-0 end-0 shadow-sm" style={{ zIndex: 1060 }}>
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.latitude}-${suggestion.longitude}-${suggestion.address}`}
              type="button"
              role="option"
              className="list-group-item list-group-item-action text-start"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(suggestion)}
            >
              {suggestion.label}
            </button>
          ))}
          {!loading && suggestions.length === 0 && (
            <span className="list-group-item text-muted">{t('Fant ingen offisiell adresse. Du kan fortsatt skrive adressen manuelt.')}</span>
          )}
        </div>
      )}
      <Form.Text className={lookupFailed ? 'text-warning' : 'text-muted'}>
        {lookupFailed
          ? t('Adressesøket er midlertidig utilgjengelig. Du kan fortsatt skrive adressen manuelt.')
          : t('Velg et søkeresultat for å plassere pasienten riktig på kartet.')}
      </Form.Text>
    </Form.Group>
  );
};

export default AddressAutocomplete;
