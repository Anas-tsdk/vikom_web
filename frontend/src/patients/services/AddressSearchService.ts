export interface AddressSuggestion {
  label: string;
  address: string;
  postalCode: string;
  city: string;
  municipality: string;
  latitude: number;
  longitude: number;
}

interface KartverketAddress {
  adressetekst?: string;
  postnummer?: string;
  poststed?: string;
  kommunenavn?: string;
  representasjonspunkt?: { lat?: number; lon?: number };
}

export async function searchAddresses(
  query: string,
  limit = 7,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const url = new URL('https://ws.geonorge.no/adresser/v1/sok');
  url.searchParams.set('sok', trimmed);
  url.searchParams.set('treffPerSide', String(limit));
  url.searchParams.set('side', '0');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Address lookup failed');
  const body = await response.json() as { adresser?: KartverketAddress[] };

  return (body.adresser ?? []).flatMap((item) => {
    const latitude = item.representasjonspunkt?.lat;
    const longitude = item.representasjonspunkt?.lon;
    if (!item.adressetekst || typeof latitude !== 'number' || typeof longitude !== 'number') return [];
    const postalCode = item.postnummer ?? '';
    const city = item.poststed ?? '';
    const address = [item.adressetekst, [postalCode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return [{
      label: [address, item.kommunenavn].filter(Boolean).join(' · '),
      address,
      postalCode,
      city,
      municipality: item.kommunenavn ?? '',
      latitude,
      longitude,
    }];
  });
}
