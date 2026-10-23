import { useState, type ReactNode } from 'react';
import type { ChatMessage } from '@denimcat/shared';

type ActivityItem = { kind: 'log'; key: string; text: string } | { kind: 'chat'; key: string; message: ChatMessage };

/**
 * Interleaves chat messages into the game log by position, not wall-clock
 * time: each message's `afterLogIndex` says "the log had this many
 * entries when this was sent" (see ChatMessage's doc comment in
 * @denimcat/shared for why). Messages sharing an index are ordered by
 * `at`. Exported for the merge logic to stay a plain, inspectable
 * function — there's no client test runner in this repo to exercise it
 * automatically, so keeping it pure/readable is what substitutes for one.
 */
export function mergeLogAndChat(log: string[], chatMessages: ChatMessage[]): ActivityItem[] {
  const byIndex = new Map<number, ChatMessage[]>();
  for (const message of chatMessages) {
    const bucket = byIndex.get(message.afterLogIndex);
    if (bucket) bucket.push(message);
    else byIndex.set(message.afterLogIndex, [message]);
  }
  for (const bucket of byIndex.values()) bucket.sort((a, b) => a.at - b.at);

  const items: ActivityItem[] = [];
  const pushChatAt = (index: number) => {
    for (const message of byIndex.get(index) ?? []) items.push({ kind: 'chat', key: message.id, message });
  };

  pushChatAt(0);
  log.forEach((text, i) => {
    items.push({ kind: 'log', key: `log-${i}`, text });
    pushChatAt(i + 1);
  });
  return items;
}

/**
 * The game log and chat, interleaved into one chronological feed (newest
 * first, matching the old LogPanel's convention) with a compose box. The
 * one shared component every game uses for this — so a future
 * improvement here (styling, merge behavior, chat UX) benefits all of
 * them at once, rather than each game forking its own copy. A game that
 * needs its log entries rendered specially (e.g. Tash-Kalar's hoverable
 * card/task-name tooltips) passes `renderLogText` instead of forking;
 * everything else about this component — chat, merge order, compose box
 * — still applies unchanged.
 */
export function ActivityPanel({
  log,
  chatMessages,
  onSend,
  seatLabel,
  renderLogText,
}: {
  log: string[];
  chatMessages: ChatMessage[];
  onSend: (text: string) => void;
  seatLabel: (seat: string) => string;
  /** Overrides how a plain log line renders. Defaults to plain text. */
  renderLogText?: (text: string) => ReactNode;
}) {
  const [draft, setDraft] = useState('');
  const items = mergeLogAndChat(log, chatMessages);

  function send() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }

  return (
    <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>Log</h3>
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nothing has happened yet.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, maxHeight: 220, overflowY: 'auto', fontSize: 13 }}>
          {[...items].reverse().map((item) =>
            item.kind === 'log' ? (
              <li key={item.key}>{renderLogText ? renderLogText(item.text) : item.text}</li>
            ) : (
              <li key={item.key} style={{ listStyle: 'none', marginLeft: -16 }}>
                <strong>{item.message.name ?? (item.message.seat === 'spectator' ? 'Spectator' : seatLabel(item.message.seat))}:</strong>{' '}
                {item.message.text}
              </li>
            ),
          )}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Say something…"
          style={{ flex: 1, fontSize: 13, padding: '4px 8px' }}
        />
        <button className="btn" onClick={send} style={{ fontSize: 13, padding: '4px 10px' }}>
          Send
        </button>
      </div>
    </div>
  );
}
