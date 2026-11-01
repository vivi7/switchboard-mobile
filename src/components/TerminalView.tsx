import { useCallback, useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { onDesktopEvent, request, useConnection } from '@/store/connection';
import { TERMINAL_HTML } from '@/terminal/terminal-html.generated';
import { colors, spacing } from '@/theme';

// react-native-webview types its class as WebView<P = undefined>, which makes
// every prop `never`; give it the shape it actually has.
type WebViewHandle = { injectJavaScript(script: string): void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

const MIN_FONT = 8;
const MAX_FONT = 18;

/**
 * A live terminal for one session: xterm.js in a WebView, fed by the
 * desktop's terminal-reset / terminal-data / terminal-size events. With "Fit
 * to phone" the PTY takes the phone's size while this is open (the desktop
 * gets its own size back when it closes); without it, the terminal keeps the
 * desktop's width and scrolls sideways.
 */
export function TerminalView({ sessionId, onInput }: { sessionId: string; onInput?: (send: (data: string) => void) => void }) {
  const webRef = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  const pending = useRef<string[]>([]);
  const lastSeq = useRef<number | null>(null);
  const idRef = useRef(sessionId);
  const fitRef = useRef(true);
  const online = useConnection((s) => s.status.state === 'online');
  const [fitToPhone, setFitToPhone] = useState(true);
  const [fontSize, setFontSize] = useState(12);
  const [error, setError] = useState('');

  const run = useCallback((js: string) => {
    if (ready.current) webRef.current?.injectJavaScript(`${js};true;`);
    else pending.current.push(js);
  }, []);

  const send = useCallback((data: string) => {
    request('terminal-input', [idRef.current, data]).catch(() => {});
  }, []);

  useEffect(() => { onInput?.(send); }, [onInput, send]);

  // Output for this session. The id can change once (a fork, a Codex
  // session getting its real id); follow it.
  useEffect(() => onDesktopEvent((event, args) => {
    if ((event === 'session-detected' || event === 'session-forked') && args[0] === idRef.current) {
      idRef.current = args[1];
      return;
    }
    if (args[0] !== idRef.current) return;
    if (event === 'terminal-reset') {
      const [, data, seq, meta] = args;
      lastSeq.current = seq;
      run(`sb.reset(${JSON.stringify(data)}, ${meta?.cols || 0}, ${meta?.rows || 0})`);
    } else if (event === 'terminal-data') {
      lastSeq.current = args[2];
      run(`sb.write(${JSON.stringify(args[1])})`);
    } else if (event === 'terminal-size') {
      run(`sb.resize(${args[1]}, ${args[2]})`);
    } else if (event === 'terminal-overflow') {
      // Too far behind: start again from a fresh replay.
      lastSeq.current = null;
      request('attach-terminal', [idRef.current]).catch(() => {});
    }
  }), [run]);

  // Attach while open and online; again after every reconnect, from where
  // it left off. Leaving detaches, which also gives the desktop its size back.
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    request('attach-terminal', lastSeq.current === null ? [idRef.current] : [idRef.current, lastSeq.current])
      .then(() => {
        if (cancelled) return;
        setError('');
        if (fitRef.current) run('sb.measure()');
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => {
      cancelled = true;
      request('detach-terminal', [idRef.current]).catch(() => {});
    };
  }, [online, run]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let message: any;
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (message.type === 'ready') {
      ready.current = true;
      for (const js of pending.current.splice(0)) webRef.current?.injectJavaScript(`${js};true;`);
    } else if (message.type === 'input') {
      send(message.data);
    } else if (message.type === 'measure' && fitRef.current && message.cols && message.rows) {
      request('fit-terminal', [idRef.current, message.cols, message.rows]).catch(() => {});
    }
  }, [send]);

  const toggleFit = () => {
    const next = !fitRef.current;
    fitRef.current = next;
    setFitToPhone(next);
    if (next) {
      run('sb.measure()');
    } else {
      run('sb.unfit()');
      request('unfit-terminal', [idRef.current])
        .then((size) => { if (size) run(`sb.resize(${size.cols}, ${size.rows})`); })
        .catch(() => {});
    }
  };

  const changeFont = (delta: number) => {
    const next = Math.min(MAX_FONT, Math.max(MIN_FONT, fontSize + delta));
    setFontSize(next);
    run(`sb.fontSize(${next})`);
    if (fitRef.current) run('sb.measure()');
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Pressable onPress={toggleFit} style={[styles.tool, fitToPhone && styles.toolOn]} accessibilityRole="switch" accessibilityState={{ checked: fitToPhone }}>
          <Text style={[styles.toolText, fitToPhone && styles.toolTextOn]}>Fit to phone</Text>
        </Pressable>
        <View style={styles.flex} />
        <Pressable onPress={() => changeFont(-1)} style={styles.tool} accessibilityLabel="Smaller text"><Text style={styles.toolText}>A−</Text></Pressable>
        <Pressable onPress={() => changeFont(1)} style={styles.tool} accessibilityLabel="Larger text"><Text style={styles.toolText}>A+</Text></Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <WebView
        ref={webRef}
        source={{ html: TERMINAL_HTML }}
        originWhitelist={['*']}
        onMessage={onMessage}
        style={styles.web}
        containerStyle={styles.web}
        bounces={false}
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        allowsLinkPreview={false}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  flex: { flex: 1 },
  tool: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  toolOn: { backgroundColor: 'rgba(128,136,255,0.18)', borderColor: colors.accent },
  toolText: { color: colors.textDim, fontSize: 12 },
  toolTextOn: { color: colors.text },
  error: { color: colors.attention, fontSize: 13, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  web: { flex: 1, backgroundColor: colors.background },
});
