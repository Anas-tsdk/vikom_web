import React, { useEffect, useState } from 'react';
import { Button, Form, InputGroup, ListGroup, Spinner } from 'react-bootstrap';
import Avatar from '../../components/common/Avatar';
import Badge from '../../components/common/Badge';
import SupabaseProfileService, {
  looksLikeUuid,
  SupabaseLookupError,
  type SupabaseProfile,
} from '../services/SupabaseProfileService';

export interface SupabaseLinkValue {
  supabaseProfileId: string;
  /**
   * Display name only, and only when we happen to know it (the nurse just picked
   * it from the search results). It is never persisted: the patient's URL handle
   * is a separate, local value that linking must not touch.
   */
  username: string | null;
}

interface SupabaseProfileFieldProps {
  value: SupabaseLinkValue | null;
  onChange: (value: SupabaseLinkValue | null) => void;
}

/**
 * Links a patient to their Supabase profile, which is what lets the TV app
 * resolve them (appointments, care team, incoming calls).
 *
 * The nurse searches by the username shown in the TV app, or pastes the UUID;
 * both resolve through the personnel-only backend endpoint, so the account is
 * confirmed to exist before it is saved. If the server has no service-role key
 * the field degrades to a plain UUID input rather than blocking the form.
 */
const SupabaseProfileField: React.FC<SupabaseProfileFieldProps> = ({ value, onChange }) => {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<SupabaseProfile[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [searched, setSearched] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [notConfigured, setNotConfigured] = useState<boolean>(false);

  // Name for an already-linked profile, looked up from its id. Kept local rather
  // than pushed back through onChange so that reopening the form cannot rewrite
  // the parent's state (or loop when a profile has no username).
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  const linkedId = value?.supabaseProfileId ?? null;

  // Resolve the display name whenever the linked id changes. A stale name from a
  // previous id must never survive, so clear first and then fetch.
  useEffect(() => {
    setResolvedName(null);

    if (!linkedId || notConfigured) return;

    let cancelled = false;

    SupabaseProfileService.getById(linkedId)
      .then((profile) => {
        if (!cancelled && profile) setResolvedName(profile.username);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof SupabaseLookupError && err.notConfigured) setNotConfigured(true);
        // Otherwise stay quiet: the link itself is valid, we just show the UUID.
        console.error(err);
      });

    return () => {
      cancelled = true;
    };
  }, [linkedId, notConfigured]);

  const handleSearch = async () => {
    const term = query.trim();
    if (!term) return;

    try {
      setSearching(true);
      setError('');
      setSearched(true);

      if (looksLikeUuid(term)) {
        const profile = await SupabaseProfileService.getById(term);
        setResults(profile ? [profile] : []);
      } else {
        setResults(await SupabaseProfileService.searchByUsername(term));
      }
    } catch (err) {
      if (err instanceof SupabaseLookupError && err.notConfigured) {
        setNotConfigured(true);
      } else {
        setError(err instanceof Error ? err.message : 'Kunne ikke søke i Supabase-profiler.');
      }
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (profile: SupabaseProfile) => {
    onChange({ supabaseProfileId: profile.id, username: profile.username });
    setResults([]);
    setSearched(false);
    setQuery('');
  };

  const handleClear = () => {
    onChange(null);
    setResults([]);
    setSearched(false);
    setQuery('');
  };

  // Enter inside the search box must not submit the surrounding patient form.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  if (notConfigured) {
    return (
      <Form.Group controlId="patientSupabaseId">
        <Form.Label>Supabase-profil (TV-app)</Form.Label>
        <Form.Control
          type="text"
          value={value?.supabaseProfileId ?? ''}
          placeholder="UUID fra Supabase"
          onChange={(e) =>
            onChange(
              // A hand-typed id means we no longer know whose account it is, so
              // the previous display name must not be carried over.
              e.target.value.trim()
                ? { supabaseProfileId: e.target.value.trim(), username: null }
                : null
            )
          }
        />
        <Form.Text className="text-muted">
          Supabase-oppslag er ikke satt opp på serveren, så profilen kan ikke slås opp. Lim inn
          UUID-en manuelt.
        </Form.Text>
      </Form.Group>
    );
  }

  const displayName = value?.username ?? resolvedName;

  return (
    <Form.Group controlId="patientSupabaseProfile">
      <Form.Label>Supabase-profil (TV-app)</Form.Label>

      {value ? (
        <div className="d-flex align-items-center justify-content-between gap-2 border rounded p-2">
          <div className="d-flex align-items-center gap-2 text-truncate">
            <Avatar name={displayName ?? '?'} size="sm" />
            <div className="text-truncate">
              <div className="fw-semibold text-truncate">{displayName ?? 'Ukjent brukernavn'}</div>
              <div className="small text-muted text-truncate">{value.supabaseProfileId}</div>
            </div>
            <Badge bg="connected" icon="check-circle">
              Koblet
            </Badge>
          </div>
          <Button variant="outline-secondary" size="sm" type="button" onClick={handleClear}>
            Fjern kobling
          </Button>
        </div>
      ) : (
        <>
          <InputGroup>
            <Form.Control
              type="text"
              value={query}
              placeholder="Søk på brukernavn, eller lim inn UUID"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button
              variant="outline-primary"
              type="button"
              onClick={handleSearch}
              disabled={searching || !query.trim()}
            >
              {searching ? (
                <Spinner animation="border" size="sm" />
              ) : (
                <i className="bi bi-search" aria-hidden="true"></i>
              )}
            </Button>
          </InputGroup>

          {results.length > 0 && (
            <ListGroup className="mt-2">
              {results.map((profile) => (
                <ListGroup.Item
                  key={profile.id}
                  action
                  type="button"
                  onClick={() => handleSelect(profile)}
                  className="d-flex align-items-center gap-2"
                >
                  <Avatar name={profile.username ?? '?'} size="sm" imageUrl={profile.avatarUrl} />
                  <span className="fw-semibold text-truncate">
                    {profile.username ?? 'Uten brukernavn'}
                  </span>
                  {profile.deviceType && <Badge bg="light" bordered>{profile.deviceType}</Badge>}
                  {profile.isOnline && (
                    <Badge bg="success" icon="broadcast">
                      Pålogget
                    </Badge>
                  )}
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}

          {searched && !searching && results.length === 0 && !error && (
            <Form.Text className="text-muted">
              Fant ingen Supabase-profil. Kontoen må først opprettes i TV-appen.
            </Form.Text>
          )}

          {error && <Form.Text className="text-danger">{error}</Form.Text>}

          {!searched && !error && (
            <Form.Text className="text-muted">
              Kobler pasienten til TV-appen. Kan legges til senere.
            </Form.Text>
          )}
        </>
      )}
    </Form.Group>
  );
};

export default SupabaseProfileField;
