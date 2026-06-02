import { useEffect, useMemo, useRef, useState } from 'react';

// Configurable at build-time via Vite env. Defaults to the production API.
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.airrepo.net';

const PLACEHOLDER_TAILS = ['N91GF', 'C-GMJF', 'VH-OJA', 'G-INFO', 'EI-LBS', 'ZK-PQR', 'PP-XYZ'];

// Rotating ATC-flavoured microcopy shown while a request is in flight.
const TOWER_LINES = [
  'Pinging the tower…',
  'Squawking the registry…',
  'Reading the transponder…',
  'Cross-checking the flight strip…',
];

// Subtle aviation easter egg: type one of these and a hidden flair appears.
const SECRET_TAILS = new Set(['BACON', 'WAGON', 'CLEARED', 'MAVERICK', 'GOOSE']);

function Brand() {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-sky-500/90 to-indigo-500/90 shadow-lg shadow-sky-500/20">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22l-4-9-9-4z" />
        </svg>
      </span>
      <span className="text-base font-semibold tracking-tight text-white">
        air<span className="text-sky-400">Repo</span>
      </span>
    </div>
  );
}

function Propeller({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="1.8" />
      <ellipse cx="12" cy="5.4" rx="1.5" ry="3.6" />
      <ellipse cx="12" cy="18.6" rx="1.5" ry="3.6" />
      <ellipse cx="5.4" cy="12" rx="3.6" ry="1.5" />
      <ellipse cx="18.6" cy="12" rx="3.6" ry="1.5" />
    </svg>
  );
}

function CompassWatermark() {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="cFade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(148,163,184,0.18)" />
          <stop offset="100%" stopColor="rgba(148,163,184,0)" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="0.6" />
      <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="0.5" />
      <g stroke="rgba(148,163,184,0.25)" strokeWidth="0.6">
        {Array.from({ length: 36 }).map((_, i) => {
          const a = (i * Math.PI) / 18;
          const x1 = 100 + Math.cos(a) * 84;
          const y1 = 100 + Math.sin(a) * 84;
          const r = i % 9 === 0 ? 70 : 80;
          const x2 = 100 + Math.cos(a) * r;
          const y2 = 100 + Math.sin(a) * r;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>
      <polygon points="100,30 106,100 100,108 94,100" fill="rgba(56,189,248,0.45)" />
      <polygon points="100,170 106,100 100,92 94,100" fill="rgba(148,163,184,0.35)" />
      <circle cx="100" cy="100" r="3" fill="rgba(226,232,240,0.6)" />
      <text x="100" y="22" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="url(#cFade)">N</text>
      <text x="100" y="186" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="url(#cFade)">S</text>
      <text x="22" y="104" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="url(#cFade)">W</text>
      <text x="178" y="104" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="url(#cFade)">E</text>
    </svg>
  );
}

function Footer() {
  // Standard fixed footer — the id-hooks are preserved for portability with
  // your existing footer-year script, but we also render the year directly
  // in case that script isn't loaded here.
  const year = useMemo(() => new Date().getFullYear(), []);
  return (
    <footer
      className="fixed bottom-0 left-0 w-full text-center py-3"
      style={{ zIndex: 10 }}
    >
      <a
        id="footer-link"
        href="https://maximilianmcclelland.com"
        style={{ textDecoration: 'none' }}
        className="text-sm font-medium transition-colors duration-1000"
      >
        TrueProblematic &copy; <span id="footer-year">{year}</span>
      </a>
    </footer>
  );
}

function StatusLabel({ children, tone = 'sky' }) {
  const palettes = {
    sky: 'text-sky-300/80',
    amber: 'text-amber-300/80',
    rose: 'text-rose-300/80',
    slate: 'text-slate-500',
  };
  return (
    <div className={`text-[0.7rem] font-semibold uppercase tracking-[0.28em] ${palettes[tone] || palettes.sky}`}>
      {children}
    </div>
  );
}

function ResultCard({ result }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 px-6 py-6 shadow-2xl backdrop-blur transition hover:border-sky-400/40 animate-fade-up sm:px-8 sm:py-7">
      {/* Subtle airframe accent line, like a runway centreline */}
      <span className="pointer-events-none absolute left-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-sky-400/30 to-transparent" />

      <div className="flex items-center justify-between">
        <StatusLabel tone="sky">Identified</StatusLabel>
        <Propeller className="h-4 w-4 text-sky-400/80" />
      </div>

      <div className="mt-4 flex items-baseline gap-3">
        <span className="font-mono text-3xl font-semibold tracking-wider text-white sm:text-4xl">
          {result.tail || '—'}
        </span>
        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">tail</span>
      </div>

      <dl className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Make &amp; Model" value={result.make_model} />
        <Field label="Year Manufactured" value={result.manufactured} mono />
        <div className="sm:col-span-2">
          <Field label="Registered Owner" value={result.owner} />
        </div>
      </dl>
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </dt>
      <dd className={`mt-1.5 text-base text-slate-100 ${mono ? 'font-mono' : ''}`}>
        {value || <span className="text-slate-500">—</span>}
      </dd>
    </div>
  );
}

function ErrorCard({ error, lastQuery }) {
  const code = error.error;
  const heading =
    code === 'not_found' ? 'Off Our Radar' :
      code === 'unsupported_region' ? 'Outside Our Coverage' :
        code === 'network_error' ? 'No Signal' :
          'Squawk 7700';

  const tone = code === 'unsupported_region' ? 'amber' : 'rose';
  const border = tone === 'amber'
    ? 'border-amber-400/30 bg-amber-400/5'
    : 'border-rose-500/30 bg-rose-500/5';

  return (
    <div className={`rounded-2xl border ${border} px-6 py-5 animate-fade-up sm:px-8`}>
      <StatusLabel tone={tone}>{heading}</StatusLabel>
      <div className="mt-2 text-base text-slate-200">
        {code === 'not_found' && (
          <>We couldn’t locate <span className="font-mono text-white">{error.tail || lastQuery}</span> in any active registry.</>
        )}
        {code === 'unsupported_region' && (
          <>We don’t hold records for the <span className="text-white">{error.region}</span> registry yet — for now we cover the US, Canada, UK, Australia, New Zealand, Brazil, and Ireland.</>
        )}
        {code === 'network_error' && (
          <>Couldn’t reach the API. Check your connection and try again.</>
        )}
        {!['not_found', 'unsupported_region', 'network_error'].includes(code) && (
          <>Something went sideways: {error.detail || code || 'unknown error'}.</>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center sm:px-8">
      <StatusLabel tone="slate">Standing By</StatusLabel>
      <p className="mt-2 text-sm text-slate-500">Cleared for queries.</p>
    </div>
  );
}

export default function App() {
  const randomExamples = useMemo(() => {
    const REGION_EXAMPLES = {
      'US': ['N91GF', 'N737AA', 'N12345', 'N183SD', 'N188Q', 'N196TT'],
      'Canada': ['C-GMJF', 'C-FZRR', 'C-FMPP', 'C-FNTP', 'C-GSQY'],
      'Australia': ['VH-OJA', 'VH-XYZ', 'VH-5QP', 'VH-6QP', 'VH-85T'],
      'NZ': ['ZK-PQR', 'ZK-ABC'],
      'Brazil': ['PP-XYZ', 'PT-ABC'],
      'Ireland': ['EI-LBS', 'EJ-XYZ'],
      'UK': ['G-INFO', 'G-ABCD']
    };
    const regions = Object.keys(REGION_EXAMPLES);
    const shuffled = [...regions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 4).map(region => {
      const list = REGION_EXAMPLES[region];
      return list[Math.floor(Math.random() * list.length)];
    });
  }, []);

  const [tail, setTail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [lastQuery, setLastQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [towerIdx, setTowerIdx] = useState(0);
  const [secret, setSecret] = useState(false);
  const inputRef = useRef(null);

  // Rotate the placeholder hint while the field is idle.
  useEffect(() => {
    if (tail || loading) return;
    const i = setInterval(() => {
      setPlaceholderIdx(x => (x + 1) % PLACEHOLDER_TAILS.length);
    }, 2200);
    return () => clearInterval(i);
  }, [tail, loading]);

  // Cycle the ATC microcopy while loading.
  useEffect(() => {
    if (!loading) return;
    const i = setInterval(() => {
      setTowerIdx(x => (x + 1) % TOWER_LINES.length);
    }, 900);
    return () => clearInterval(i);
  }, [loading]);

  // "/" focuses the input from anywhere on the page.
  useEffect(() => {
    const onKey = e => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    const q = tail.trim().toUpperCase();
    if (!q) return;

    setSecret(SECRET_TAILS.has(q));
    setLastQuery(q);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/v1/aircraft/${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ ...data, error: data.error || 'unknown', status: res.status });
      } else {
        setResult(data);
      }
    } catch (err) {
      setError({ error: 'network_error', detail: String(err) });
    } finally {
      setLoading(false);
    }
  }

  const placeholder = PLACEHOLDER_TAILS[placeholderIdx];

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background flourishes */}
      <div className="pointer-events-none absolute inset-0 flight-grid opacity-60" />
      <div className="pointer-events-none absolute -top-32 right-[-8rem] h-[36rem] w-[36rem] opacity-[0.07] sm:opacity-[0.09]">
        <CompassWatermark />
      </div>
      <div className="pointer-events-none absolute -bottom-40 left-[-10rem] h-[40rem] w-[40rem] opacity-[0.05]">
        <CompassWatermark />
      </div>

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-5 pt-6 sm:px-8 sm:pt-8">
        <Brand />
        <span className="hidden text-[0.7rem] font-medium uppercase tracking-[0.28em] text-slate-500 sm:inline">
          Global Tail Lookup
        </span>
      </header>

      {/* Hero + form + result */}
      <main className="relative z-10 mx-auto flex max-w-3xl flex-col px-5 pb-32 pt-16 sm:px-8 sm:pt-24">
        <div className="text-center">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Identify any aircraft.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-balance text-sm text-slate-400 sm:text-base">
            One search box, civil aviation registries from across the globe.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-10 w-full sm:mt-12">
          <div className="group relative">
            <div className="absolute -inset-px -z-10 rounded-2xl bg-gradient-to-r from-sky-500/40 via-cyan-400/20 to-indigo-500/40 opacity-40 blur-xl transition group-focus-within:opacity-80" />
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 shadow-2xl backdrop-blur sm:px-5 sm:py-4">
              <span className="hidden h-7 w-7 place-items-center rounded-md border border-white/10 bg-white/5 font-mono text-xs text-slate-400 sm:grid" aria-hidden="true">
                /
              </span>
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                value={tail}
                onChange={e => setTail(e.target.value.toUpperCase())}
                placeholder={placeholder}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-transparent font-mono text-lg uppercase tracking-wider text-white placeholder:text-slate-600 focus:outline-none sm:text-xl"
                aria-label="Aircraft tail number"
              />
              <button
                type="submit"
                disabled={loading || !tail.trim()}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none sm:px-4"
              >
                {loading ? (
                  <>
                    <Propeller className="h-4 w-4 animate-spin-fast" />
                    <span className="hidden sm:inline">Searching</span>
                  </>
                ) : (
                  <>
                    <span>Search</span>
                    <span className="opacity-70" aria-hidden="true">↵</span>
                  </>
                )}
              </button>
            </div>
            <div className="mt-2 pl-1 text-[0.78rem] text-slate-500">
              {loading ? (
                <span className="inline-flex items-center gap-1.5 text-sky-300/80">
                  <span className="relative inline-block h-1.5 w-1.5">
                    <span className="absolute inset-0 rounded-full bg-sky-400" />
                    <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/60" />
                  </span>
                  {TOWER_LINES[towerIdx]}
                </span>
              ) : (
                <>Try a US, Canadian, Australian, NZ, UK, Brazilian, or Irish tail.</>
              )}
            </div>
          </div>
        </form>

        {/* Result slot */}
        <div className="mt-8 w-full sm:mt-10">
          {error ? (
            <ErrorCard error={error} lastQuery={lastQuery} />
          ) : result ? (
            <ResultCard result={result} />
          ) : (
            <EmptyState />
          )}

          {secret && !loading && (
            <p className="mt-3 text-center text-[0.7rem] uppercase tracking-[0.28em] text-sky-400/60 animate-fade-up">
              ✈ Maverick clearance acknowledged — top of the charts.
            </p>
          )}
        </div>

        {/* Quick-pick chips for one-tap demos / casual exploration */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400 sm:mt-14">
          <span className="text-slate-500">try:</span>
          {randomExamples.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTail(t);
                setTimeout(() => inputRef.current?.form?.requestSubmit(), 0);
              }}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono uppercase tracking-wider text-slate-300 transition hover:border-sky-400/40 hover:bg-sky-400/10 hover:text-white"
            >
              {t}
            </button>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
