'use client';

import { useEffect } from 'react';

import { getOfficialUrlFromCurrentLocation } from '@/lib/public-url';

export function CanonicalDomainRedirect() {
  useEffect(() => {
    if (window.location.hostname !== 'e-trading-n.web.app') return;
    window.location.replace(getOfficialUrlFromCurrentLocation());
  }, []);

  return null;
}
