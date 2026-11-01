import { expect, test } from '@jest/globals';
import nacl from 'tweetnacl';

import { connectToDesktop, pairWithDesktop, RejectedError, RemoteClient, type ConnectionStatus, type DesktopLink } from '../client';
import { FakeDesktop } from '../testing/fake-desktop';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait until `check` holds; the handshake takes a while under Jest. */
async function until(check: () => boolean, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting');
    await wait(20);
  }
}

function linkTo(desktop: FakeDesktop, addresses = ['192.168.1.20']): DesktopLink {
  return { addresses, port: 47100, desktopKey: desktop.identity.publicKey };
}

/** Pair a phone with the fake desktop and return its key. */
async function pairedPhone(desktop: FakeDesktop) {
  const code = desktop.openPairing();
  const { device } = await pairWithDesktop(linkTo(desktop), code, 'Test phone', { socketFactory: desktop.factory });
  return device;
}

test('pairing registers the phone and returns the desktop hello', async () => {
  const desktop = new FakeDesktop();
  const code = desktop.openPairing();
  const paired = await pairWithDesktop(linkTo(desktop), code, 'Alex iPhone', { socketFactory: desktop.factory });
  expect(paired.hello.desktop).toBe('Test Mac');
  expect(paired.hello.device.name).toBe('Alex iPhone');
  expect(paired.address).toBe('192.168.1.20');
  expect(desktop.pairingCode).toBeNull();
});

test('a wrong or used pairing code is rejected with a message to act on', async () => {
  const desktop = new FakeDesktop();
  desktop.openPairing();
  await expect(pairWithDesktop(linkTo(desktop), nacl.randomBytes(32), 'Phone', { socketFactory: desktop.factory }))
    .rejects.toMatchObject({ reason: 'pairing-failed' });
  const closed = new FakeDesktop();
  await expect(pairWithDesktop(linkTo(closed), nacl.randomBytes(32), 'Phone', { socketFactory: closed.factory }))
    .rejects.toThrow('The pairing code is no longer valid. Show a new one on the computer.');
});

test('a desktop without the key from the QR code is refused', async () => {
  const desktop = new FakeDesktop();
  const device = await pairedPhone(desktop);
  const impostor = { ...linkTo(desktop), desktopKey: nacl.box.keyPair().publicKey };
  await expect(connectToDesktop(impostor, { device, socketFactory: desktop.factory })).rejects.toBeInstanceOf(RejectedError);
});

test('addresses that do not answer are skipped', async () => {
  const desktop = new FakeDesktop();
  const device = await pairedPhone(desktop);
  const link = linkTo(desktop, ['10.0.0.9', 'mac.local', '192.168.1.20']);
  const connection = await connectToDesktop(link, { device, socketFactory: desktop.factory });
  expect(connection.address).toBe('192.168.1.20');
  connection.ws.close();
  desktop.reachable.clear();
  await expect(connectToDesktop(link, { device, socketFactory: desktop.factory })).rejects.toThrow(/not reachable/);
});

test('requests get their replies, errors reject, and events arrive', async () => {
  const desktop = new FakeDesktop();
  const device = await pairedPhone(desktop);
  desktop.methods['get-projects'] = (archived: boolean) => [{ projectPath: '/p', archived }];
  desktop.methods['get-stats'] = () => { throw new Error('stats-cache.json is missing'); };
  const events: any[] = [];
  const client = new RemoteClient({ link: linkTo(desktop), device, socketFactory: desktop.factory, onEvent: (e, args) => events.push([e, ...args]) });
  await client.start();
  expect(client.status.state).toBe('online');
  await expect(client.request('get-projects', [true])).resolves.toEqual([{ projectPath: '/p', archived: true }]);
  await expect(client.request('get-stats')).rejects.toThrow('stats-cache.json is missing');
  await expect(client.request('open-external')).rejects.toThrow(/Not available remotely/);
  desktop.emit('cli-busy-state', 's1', true);
  await wait(10);
  expect(events).toEqual([['cli-busy-state', 's1', true]]);
  client.stop();
});

test('a slow reply times out', async () => {
  const desktop = new FakeDesktop();
  const device = await pairedPhone(desktop);
  desktop.methods['get-usage'] = () => 1;
  const client = new RemoteClient({ link: linkTo(desktop), device, socketFactory: desktop.factory, requestTimeoutMs: 1 });
  await client.start();
  desktop.receive = () => {}; // the computer stops answering
  await expect(client.request('get-usage')).rejects.toThrow('get-usage took too long');
  // A call known to be slow (a push) can wait longer.
  const slow = client.request('get-usage', [], { timeoutMs: 50 });
  await wait(20);
  let settled = false;
  slow.then(() => { settled = true; }, () => { settled = true; });
  await wait(5);
  expect(settled).toBe(false);
  await expect(slow).rejects.toThrow('get-usage took too long');
  client.stop();
});

test('a revoked phone stops trying and says why', async () => {
  const desktop = new FakeDesktop();
  const device = await pairedPhone(desktop);
  const statuses: ConnectionStatus[] = [];
  const client = new RemoteClient({ link: linkTo(desktop), device, socketFactory: desktop.factory, onStatus: (s) => statuses.push(s) });
  await client.start();
  desktop.devices.clear();
  desktop.closeAll(4004, 'Device revoked');
  await until(() => client.status.state === 'rejected');
  expect(client.status).toEqual({ state: 'rejected', reason: 'revoked', message: 'This phone was removed on the computer. Pair it again.' });
  await expect(client.request('get-projects')).rejects.toThrow('Not connected');
  client.stop();
});

test('a dropped connection comes back on its own, through the address that worked', async () => {
  const desktop = new FakeDesktop();
  const device = await pairedPhone(desktop);
  desktop.reachable.add('mac.local');
  const client = new RemoteClient({ link: linkTo(desktop, ['10.0.0.9', '192.168.1.20', 'mac.local']), device, socketFactory: desktop.factory });
  await client.start();
  desktop.connections = [];
  desktop.closeAll(1001, 'Remote access turned off');
  await until(() => client.status.state === 'offline');
  expect(client.status).toMatchObject({ state: 'offline', retryInMs: 1000, error: 'Mobile app access was turned off on the computer' });
  await until(() => client.status.state === 'online');
  expect(desktop.connections).toEqual(['192.168.1.20']);
  client.stop();
});
