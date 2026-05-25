export const officialPublicUrl = 'https://e-trading-n.firebaseapp.com';

export function getOfficialAppUrl(path = '/', search = '') {
  const url = new URL(path, officialPublicUrl);
  if (search) {
    const params = search.startsWith('?') ? search.slice(1) : search;
    url.search = params;
  }
  return url.toString();
}

export function getOfficialUrlFromCurrentLocation() {
  if (typeof window === 'undefined') return officialPublicUrl;
  return getOfficialAppUrl(window.location.pathname, window.location.search);
}
