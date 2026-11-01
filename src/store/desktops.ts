import * as SecureStore from 'expo-secure-store';

import { fromBase64, toBase64, type KeyPair } from '@/shared/vendor/remote-protocol';
import type { DesktopLink, Hello } from '@/remote/client';

// The computers this phone is paired with, in the keychain (iOS) or the
// Keystore-backed store (Android): each holds this phone's secret key for it.

export type SavedDesktop = {
  /** This phone's id on that computer. */
  deviceId: string;
  name: string;
  addresses: string[];
  port: number;
  desktopKey: string;
  devicePublicKey: string;
  deviceSecretKey: string;
  pairedAt: number;
  lastAddress?: string;
};

const INDEX_KEY = 'desktops';
const ACTIVE_KEY = 'desktops.active';
const itemKey = (deviceId: string) => `desktop.${deviceId}`;

async function readIndex(): Promise<string[]> {
  try {
    const list = JSON.parse((await SecureStore.getItemAsync(INDEX_KEY)) || '[]');
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function loadDesktops(): Promise<SavedDesktop[]> {
  const desktops: SavedDesktop[] = [];
  for (const id of await readIndex()) {
    const raw = await SecureStore.getItemAsync(itemKey(id));
    if (raw) {
      try { desktops.push(JSON.parse(raw)); } catch {}
    }
  }
  return desktops;
}

export async function loadActiveDesktop(): Promise<SavedDesktop | null> {
  const desktops = await loadDesktops();
  const active = await SecureStore.getItemAsync(ACTIVE_KEY);
  return desktops.find((d) => d.deviceId === active) || desktops[0] || null;
}

export async function saveDesktop(desktop: SavedDesktop, { makeActive = false } = {}) {
  await SecureStore.setItemAsync(itemKey(desktop.deviceId), JSON.stringify(desktop));
  const index = await readIndex();
  if (!index.includes(desktop.deviceId)) await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify([...index, desktop.deviceId]));
  if (makeActive) await SecureStore.setItemAsync(ACTIVE_KEY, desktop.deviceId);
}

/** Forget a computer on this phone. It stays paired there until removed on the computer. */
export async function removeDesktop(deviceId: string) {
  await SecureStore.deleteItemAsync(itemKey(deviceId));
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify((await readIndex()).filter((id) => id !== deviceId)));
  if ((await SecureStore.getItemAsync(ACTIVE_KEY)) === deviceId) await SecureStore.deleteItemAsync(ACTIVE_KEY);
}

export function desktopFromPairing(
  pairing: { desktopName: string; addresses: string[]; port: number; desktopKey: Uint8Array },
  device: KeyPair,
  hello: Hello,
  address: string,
): SavedDesktop {
  return {
    deviceId: hello.device.id,
    name: hello.desktop || pairing.desktopName,
    addresses: pairing.addresses,
    port: pairing.port,
    desktopKey: toBase64(pairing.desktopKey),
    devicePublicKey: toBase64(device.publicKey),
    deviceSecretKey: toBase64(device.secretKey),
    pairedAt: Date.now(),
    lastAddress: address,
  };
}

export function linkOf(desktop: SavedDesktop): DesktopLink {
  // The address that worked last goes first.
  const addresses = desktop.lastAddress && desktop.addresses.includes(desktop.lastAddress)
    ? [desktop.lastAddress, ...desktop.addresses.filter((a) => a !== desktop.lastAddress)]
    : desktop.addresses;
  return { addresses, port: desktop.port, desktopKey: fromBase64(desktop.desktopKey) };
}

export function keyPairOf(desktop: SavedDesktop): KeyPair {
  return { publicKey: fromBase64(desktop.devicePublicKey), secretKey: fromBase64(desktop.deviceSecretKey) };
}
