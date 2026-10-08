import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Check, Gem, Loader2, X } from "lucide-react";
import { DIFF } from "../lib/engine.js";

// ------------------------------------------------------------ panels

const CORNER = { gold: "#ffc542", violet: "#b19bff", mint: "#3fe0a5", rose: "#ff5f87" };

export function Corners({ tone }) {
  const c = CORNER[tone] || "#5a4fa8";
  const at = [
    { left: -4, top: -4, r: 0 },
    { right: -4, top: -4, r: 90 },
    { right: -4, bottom: -4, r: 180 },
    { left: -4, bottom: -4, r: 270 },
  ];
  return at.map(({ r, ...pos }, i) => (
    <svg
      key={i}
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      className="pointer-events-none absolute z-10"
      style={{ ...pos, transform: `rotate(${r}deg)` }}
    >
      <rect x="0" y="0" width="7" height="2" fill={c} />
      <rect x="0" y="0" width="2" height="7" fill={c} />
      <rect x="3" y="3" width="1" height="1" fill={c} opacity="0.7" />
    </svg>
  ));
}

export function Panel({ as: Tag = "section", tone, corners = false, className = "", children, ...rest }) {
  return (
    <Tag className={`panel ${tone ? `panel-${tone}` : ""} ${className}`} {...rest}>
      {corners && <Corners tone={tone} />}
      {children}
    </Tag>
  );
}

const TITLE_TONE = {
  gold: "bg-gold/10 text-gold ring-gold/30",
  violet: "bg-violet/10 text-violet-hi ring-violet/30",
  mint: "bg-mint/10 text-mint ring-mint/30",
  ember: "bg-ember/10 text-ember ring-ember/30",
  sky: "bg-sky/10 text-sky ring-sky/30",
  rose: "bg-rose/10 text-rose ring-rose/30",
};

export function SectionTitle({ icon: Icon, tone = "gold", children, sub, action, className = "", as: Tag = "h2" }) {
  return (
    <div className={`mb-4 flex items-center gap-3 ${className}`}>
      {Icon && (
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ${TITLE_TONE[tone]}`}>
          <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <Tag className="font-pixel text-lg uppercase leading-tight tracking-wide text-ink">{children}</Tag>
        {sub && <p className="text-xs font-semibold text-dim">{sub}</p>}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------ controls

export function Button({ variant = "gold", size = "md", icon: Icon, iconRight: IconRight, busy = false, className = "", children, ...rest }) {
  const s = size === "sm" ? 15 : size === "lg" ? 20 : 18;
  return (
    <button type="button" className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      {busy ? <Loader2 size={s} className="anim-spin" aria-hidden="true" /> : Icon && <Icon size={s} strokeWidth={2.5} aria-hidden="true" />}
      {children}
      {IconRight && <IconRight size={s} strokeWidth={2.5} aria-hidden="true" />}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className = "", size = 18, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`focus-ring grid h-9 w-9 place-items-center rounded-lg text-dim transition hover:bg-panel-hi hover:text-ink ${className}`}
      {...rest}
    >
      <Icon size={size} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}

export function Tabs({ value, onChange, items, className = "", size = "md" }) {
  return (
    <div role="tablist" className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-[#120f29] p-1 ring-1 ring-edge ${className}`}>
      {items.map((it) => {
        const on = value === it.value;
        const Icon = it.icon;
        return (
          <button
            key={it.value}
            id={it.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.value)}
            className={`focus-ring flex shrink-0 items-center gap-1.5 rounded-lg font-extrabold transition ${
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
            } ${on ? "bg-gold text-[#2a1b00] shadow-[0_2px_0_#a8740a]" : "text-dim hover:text-ink"}`}
          >
            {Icon && <Icon size={14} strokeWidth={2.5} aria-hidden="true" />}
            {it.label}
            {it.count != null && it.count > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] ${on ? "bg-[#2a1b00]/15" : "bg-rose text-white"}`}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`focus-ring relative h-7 w-12 shrink-0 rounded-full border transition ${checked ? "border-mint-deep bg-mint/80" : "border-edge bg-[#120f29]"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// ------------------------------------------------------------ indicators

export function Bar({ value, tone = "gold", segmented = true, className = "", label, height }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div
      className={`xpbar ${segmented ? "segmented" : ""} ${className}`}
      style={height ? { height } : undefined}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={`fill fill-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const BADGE = {
  gold: ["#ffe08a", "#f0a31f", "#7a4f05", "#3b2400"],
  violet: ["#cbbcff", "#7b55f5", "#36208a", "#ffffff"],
  mint: ["#a6f7d6", "#22b47f", "#0b5a3d", "#03261a"],
  dim: ["#5f5699", "#332b66", "#1b1640", "#cfc8f0"],
};

export function LevelBadge({ lvl, size = 44, tone = "gold", label }) {
  const raw = useId();
  const id = "lb" + raw.replace(/[^a-zA-Z0-9]/g, "");
  const [a, b, edge, ink] = BADGE[tone] || BADGE.gold;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={label || `Nivel ${lvl}`} className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <polygon points="20,1.5 36.5,11 36.5,29 20,38.5 3.5,29 3.5,11" fill={edge} />
      <polygon points="20,5 33,12.6 33,27.4 20,35 7,27.4 7,12.6" fill={`url(#${id})`} />
      <polygon points="20,5 33,12.6 20,13.5 7,12.6" fill="#ffffff" opacity="0.22" />
      <text x="20" y="26" textAnchor="middle" fontFamily="'Pixelify Sans', Nunito, monospace" fontSize={lvl >= 10 ? 13 : 16} fontWeight="700" fill={ink}>
        {lvl}
      </text>
    </svg>
  );
}

export function Gems({ n, size = 12 }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Dificultate: ${DIFF[n]?.label}`} aria-label={`Dificultate ${DIFF[n]?.label}`}>
      {[1, 2, 3].map((i) => (
        <Gem
          key={i}
          size={size}
          strokeWidth={2.5}
          aria-hidden="true"
          className={i <= n ? "text-sky" : "text-faint/50"}
          fill={i <= n ? "rgba(92,184,255,0.35)" : "none"}
        />
      ))}
    </span>
  );
}

const CHIP = {
  gold: "bg-gold/10 text-gold-hi ring-gold/30",
  violet: "bg-violet/15 text-violet-hi ring-violet/35",
  mint: "bg-mint/10 text-mint ring-mint/30",
  ember: "bg-ember/10 text-ember ring-ember/30",
  sky: "bg-sky/10 text-sky ring-sky/30",
  rose: "bg-rose/10 text-rose ring-rose/30",
  dim: "bg-white/5 text-dim ring-white/10",
};

export function Chip({ tone = "dim", icon: Icon, children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1 ${CHIP[tone]} ${className}`}>
      {Icon && <Icon size={12} strokeWidth={2.5} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Ring({ value, size = 44, stroke = 5, color = "#3fe0a5", track = "#2a2456", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0, Math.min(1, value)) * c} ${c}`}
          style={{ transition: "stroke-dasharray .6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Stat({ icon: Icon, label, value, sub, tone = "gold" }) {
  return (
    <div className="inset flex items-center gap-3 p-3">
      {Icon && (
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${TITLE_TONE[tone]}`}>
          <Icon size={18} strokeWidth={2.5} aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-dim">{label}</div>
        <div className="font-pixel tabular text-2xl leading-tight text-ink">{value}</div>
        {sub && <div className="truncate text-xs font-semibold text-faint">{sub}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {Icon && (
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet/10 text-violet-hi ring-1 ring-violet/30">
          <Icon size={22} aria-hidden="true" />
        </span>
      )}
      <div className="font-extrabold text-ink">{title}</div>
      {children && <p className="max-w-sm text-sm text-dim">{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function CheckButton({ checked, onClick, label, size = "md", tone = "mint" }) {
  const dim = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-7 w-7" : "h-10 w-10";
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      onClick={onClick}
      className={`focus-ring grid shrink-0 place-items-center rounded-xl border-2 transition active:translate-y-0.5 ${dim} ${
        checked
          ? tone === "mint"
            ? "border-mint bg-mint text-[#04261a] shadow-[0_3px_0_#157a55]"
            : "border-gold bg-gold text-[#2a1b00] shadow-[0_3px_0_#a8740a]"
          : "border-edge-hi bg-[#120f29] text-transparent shadow-[0_3px_0_#0b0920] hover:border-mint/70"
      }`}
    >
      <Check size={size === "sm" ? 14 : 20} strokeWidth={3.5} aria-hidden="true" />
    </button>
  );
}

// ------------------------------------------------------------ modal

export function Modal({ open, onClose, title, icon: Icon, tone = "violet", wide = false, dismissable = true, children, footer, labelledBy }) {
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && dismissable) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.activeElement;
    requestAnimationFrame(() => box.current?.querySelector("[data-autofocus], input, textarea, select, button")?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, [open, dismissable, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#05030f]/80 p-2 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose?.();
      }}
    >
      <div className={`anim-pop relative w-full ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <Corners tone={tone} />
        <div
          ref={box}
          role="dialog"
          aria-modal="true"
          aria-label={labelledBy ? undefined : title}
          aria-labelledby={labelledBy}
          className={`panel panel-${tone} max-h-[90vh] overflow-y-auto`}
        >
          {title && (
            <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-edge bg-panel/95 px-5 py-4 backdrop-blur">
              {Icon && (
                <span className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ${TITLE_TONE[tone] || TITLE_TONE.violet}`}>
                  <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
                </span>
              )}
              <h2 className="font-pixel text-xl text-ink">{title}</h2>
              {dismissable && (
                <button type="button" onClick={onClose} aria-label="Închide" className="focus-ring ml-auto rounded-lg p-1.5 text-dim hover:bg-panel-hi hover:text-ink">
                  <X size={18} aria-hidden="true" />
                </button>
              )}
            </header>
          )}
          <div className="p-5">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-edge px-5 py-4">{footer}</footer>}
        </div>
      </div>
    </div>
  );
}

export function Confirm({ open, title, children, confirmLabel = "Confirmă", tone = "rose", onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      tone={tone === "rose" ? "violet" : tone}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button variant={tone} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-body">{children}</div>
    </Modal>
  );
}

// ------------------------------------------------------------ toasts

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

const TOAST = {
  gold: "panel-gold",
  mint: "panel-mint",
  violet: "panel-violet",
  rose: "",
};

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s.slice(-3), { id, tone: "gold", ...t }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), t.ms || 3400);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-3 top-[calc(env(safe-area-inset-top,0px)+76px)] z-[70] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2">
        {items.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.id} className={`panel ${TOAST[t.tone] || ""} anim-slide pointer-events-auto flex items-start gap-3 px-4 py-3`}>
              {Icon && <Icon size={18} className={t.tone === "mint" ? "text-mint" : t.tone === "violet" ? "text-violet-hi" : t.tone === "rose" ? "text-rose" : "text-gold"} aria-hidden="true" />}
              <div className="min-w-0 text-sm">
                {t.title && <div className="font-extrabold text-ink">{t.title}</div>}
                {t.text && <div className="text-body">{t.text}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// ------------------------------------------------------------ misc

export function Field({ label, hint, children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-dim">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs font-semibold text-faint">{hint}</span>}
    </label>
  );
}

export function Typewriter({ text, speed = 18, className = "" }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!text) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setN(text.length);
      return undefined;
    }
    const t = setInterval(() => setN((x) => (x >= text.length ? x : x + 2)), speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return (
    <p className={className}>
      {text.slice(0, n)}
      {n < text.length && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-gold align-middle" />}
    </p>
  );
}

export const plural = (n, one, few, many) => {
  // Romanian: 1 → one; 2–19 (and numbers ending 01–19) → few; otherwise "de" form
  if (n === 1) return one;
  const r = n % 100;
  if (n === 0 || (r >= 1 && r <= 19)) return few;
  return many;
};
