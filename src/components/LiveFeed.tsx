import { useEffect, useState } from 'react';
import { useApp } from '../store.tsx';
import { Money, PlayerHead, timeAgo } from './ui.tsx';
import type { PublicBet } from '../api.ts';

const GAME_LABEL = { duel: 'Duel', coinflip: 'Coinflip' } as const;

function describe(b: PublicBet) {
  const o = b.outcome;
  if (o.game === 'duel') return `${o.player} vs ${o.house}`;
  return o.flip === 'heads' ? 'Heads' : 'Tails';
}

export function LiveFeed({ game, limit = 12 }: { game?: PublicBet['game']; limit?: number }) {
  const { feed } = useApp();
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  const rows = feed.filter((b) => !game || b.game === game).slice(0, limit);

  return (
    <section className="card overflow-hidden" aria-labelledby="feed-title">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 id="feed-title" className="font-bold">Live bets</h2>
        <span className="pill"><span className="h-1.5 w-1.5 rounded-full bg-win" /> live</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-3">No bets yet — be the first.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-3 uppercase">
              <tr>
                <th scope="col" className="px-5 py-2 font-semibold">Player</th>
                <th scope="col" className="px-3 py-2 font-semibold">Game</th>
                <th scope="col" className="hidden px-3 py-2 font-semibold sm:table-cell">Roll</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Bet</th>
                <th scope="col" className="px-5 py-2 text-right font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const net = b.payout - b.amount;
                return (
                  <tr key={b.id} className="border-t border-line/60 animate-in">
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-2">
                        <PlayerHead name={b.username} size={20} />
                        <span className="max-w-32 truncate">{b.username}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{GAME_LABEL[b.game]}</td>
                    <td className="hidden px-3 py-2.5 text-ink-2 sm:table-cell">{describe(b)}</td>
                    <td className="px-3 py-2.5 text-right"><Money cents={b.amount} /></td>
                    <td className={`px-5 py-2.5 text-right font-semibold ${net > 0 ? 'text-win' : net < 0 ? 'text-loss' : 'text-push'}`}>
                      <Money cents={net} sign />
                      <span className="sr-only"> {timeAgo(b.createdAt)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
