// Ways to fill in a pharmacy without typing (spec 17): pick it from the phone's contacts, or look it up in
// Google Maps. Both stay on the phone: DoseSure sends nothing and looks nothing up itself.
import { Contact, requestPermissionsAsync } from 'expo-contacts';
import { Linking } from 'react-native';

export type Picked = { name: string; phones: string[] };

/**
 * Opens the phone's contact picker. Returns the contact's name (or company) and phone numbers,
 * null if the person cancelled, or 'denied' when contacts access was refused.
 */
export async function pickFromContacts(): Promise<Picked | null | 'denied'> {
  // Android reads the picked contact's number through the contacts permission; iOS asks once too.
  const perm = await requestPermissionsAsync();
  if (!perm.granted) return 'denied';
  const c = await Contact.presentPicker();
  if (!c) return null;
  const [full, company, phones] = await Promise.all([
    c.getFullName().catch(() => ''),
    c.getCompany().catch(() => null),
    c.getPhones().catch(() => []),
  ]);
  const numbers = [...new Set(phones.map((p) => (p.number ?? '').trim()).filter(Boolean))];
  return { name: (full || company || '').trim(), phones: numbers };
}

/** Google Maps (the app if installed, otherwise the browser) searching for pharmacies near the phone. */
export const openMapsSearch = () => Linking.openURL('https://www.google.com/maps/search/?api=1&query=pharmacy%20near%20me');
