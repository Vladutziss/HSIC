import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Check, Gem, Loader2, Trash2, X } from "lucide-react";
import { DIFF } from "../lib/engine.js";
import { c, mix } from "../lib/themes.js";
import { tr } from "../lib/i18n.js";

// ------------------------------------------------------------ panels

export function Panel({ as: Tag = "section", tone, className = "", children, ...rest }) {
  return (
    <Tag className={`panel ${tone ? `panel-${tone}` : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

// Tinted icon chips (stat tiles, modal headers): the tones say what the thing is about.
const TITLE_TONE = {
  gold: "bg-gold/10 text-gold ring-gold/30",
  violet: "bg-violet/10 text-violet-hi ring-violet/30",
  mint: "bg-mint/10 text-mint ring-mint/30",
  ember: "bg-ember/10 text-ember ring-ember/30",
  sky: "bg-sky/10 text-sky ring-sky/30",
  rose: "bg-rose/10 text-rose ring-rose/30",
};

// Section headings are neutral: colour is kept for meaning (Molt/AI = violet, the main action = gold, state), not decoration.
export function SectionTitle({ icon: Icon, children, sub, action, className = "", as: Tag = "h2" }) {
  return (
    <div className={`mb-4 flex items-center gap-3 ${className}`}>
      {Icon && <Icon size={18} strokeWidth={2.25} className="shrink-0 text-dim" aria-hidden="true" />}
      <div className="min-w-0">
        <Tag className="font-display text-base leading-tight text-ink">{children}</Tag>
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
    <div role="tablist" className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-well p-1 ring-1 ring-edge ${className}`}>
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
            } ${on ? "bg-gold text-on-gold shadow-key-gold-sm" : "text-dim hover:text-ink"}`}
          >
            {Icon && <Icon size={14} strokeWidth={2.5} aria-hidden="true" />}
            {it.label}
            {it.count != null && it.count > 0 && (
              <span className={`rounded-full px-1.5 text-xs ${on ? "bg-on-gold/15" : "bg-rose text-on-rose"}`}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// A few options as pills, one tap each (instead of a dropdown) — for short, frequent choices such as time or energy.
export function Choice({ value, onChange, options, label, className = "" }) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex flex-wrap gap-1.5 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`focus-ring rounded-full px-3 py-1.5 text-sm font-extrabold ring-1 transition ${
              on ? "bg-violet text-on-violet ring-violet-hi" : "bg-well text-dim ring-edge hover:text-ink hover:ring-edge-hi"
            }`}
          >
            {o.label}
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
      className={`focus-ring relative h-7 w-12 shrink-0 rounded-full border transition ${checked ? "border-mint-deep bg-mint/80" : "border-edge bg-well"}`}
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

// [top of the gradient, bottom, outline, number]
const BADGE = {
  gold: [c("gold-hi"), mix(c("gold-deep"), 35, c("gold")), mix(c("gold-deep"), 73, "black"), c("on-gold")],
  violet: [mix(c("violet-hi"), 70, "white"), mix(c("violet-deep"), 25, c("violet")), mix(c("violet-deep"), 60, "black"), c("on-violet")],
  mint: [mix(c("mint"), 60, "white"), mix(c("mint-deep"), 50, c("mint")), mix(c("mint-deep"), 50, "black"), c("on-mint")],
  dim: [c("faint"), c("edge"), c("panel"), c("body")],
};

export function LevelBadge({ lvl, size = 44, tone = "gold", label }) {
  const raw = useId();
  const id = "lb" + raw.replace(/[^a-zA-Z0-9]/g, "");
  const [a, b, edge, ink] = BADGE[tone] || BADGE.gold;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={label || tr("Nivel {lvl}", { lvl })} className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: a }} />
          <stop offset="1" style={{ stopColor: b }} />
        </linearGradient>
      </defs>
      <polygon points="20,1.5 36.5,11 36.5,29 20,38.5 3.5,29 3.5,11" style={{ fill: edge }} />
      <polygon points="20,5 33,12.6 33,27.4 20,35 7,27.4 7,12.6" fill={`url(#${id})`} />
      <polygon points="20,5 33,12.6 20,13.5 7,12.6" fill="#ffffff" opacity="0.22" />
      <text x="20" y="26" textAnchor="middle" fontFamily="Nunito, monospace" fontSize={lvl >= 10 ? 13 : 16} fontWeight="700" style={{ fill: ink }}>
        {lvl}
      </text>
    </svg>
  );
}

export function Gems({ n, size = 12 }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={tr("Dificultate: {label}", { label: DIFF[n]?.label })} aria-label={tr("Dificultate {label}", { label: DIFF[n]?.label })}>
      {[1, 2, 3].map((i) => (
        <Gem
          key={i}
          size={size}
          strokeWidth={2.5}
          aria-hidden="true"
          className={i <= n ? "text-sky" : "text-faint/50"}
          fill={i <= n ? c("sky", 0.35) : "none"}
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
  dim: "bg-ink/5 text-dim ring-ink/10",
};

export function Chip({ tone = "dim", icon: Icon, children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-extrabold ring-1 ${CHIP[tone]} ${className}`}>
      {Icon && <Icon size={12} strokeWidth={2.5} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Ring({ value, size = 44, stroke = 5, color = c("mint-ink"), track = c("edge"), children }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
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
          strokeDasharray={`${Math.max(0, Math.min(1, value)) * circ} ${circ}`}
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
        <div className="text-xs font-extrabold uppercase tracking-wider text-dim">{label}</div>
        <div className="font-display tabular text-2xl leading-tight text-ink">{value}</div>
        {sub && <div className="text-xs font-semibold text-faint">{sub}</div>}
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
            ? "border-mint bg-mint text-on-mint shadow-key-mint"
            : "border-gold bg-gold text-on-gold shadow-key-gold"
          : "border-edge-hi bg-well text-transparent shadow-key-ghost hover:border-mint/70"
      }`}
    >
      <Check size={size === "sm" ? 14 : 20} strokeWidth={3.5} aria-hidden="true" />
    </button>
  );
}

// Round red outline button for deleting (or leaving) something: a plain click (the caller asks "are you sure?" in a modal).
export function DeleteButton({ label, onClick, icon: Icon = Trash2, title = tr("Șterge") }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-rose bg-transparent text-rose transition hover:bg-rose hover:text-on-rose active:scale-95"
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

// Round red outline button: hold it to delete. The red fill grows while pressed and the action fires when it is full;
// letting go early cancels. Space/Enter work the same way for keyboard users.
export function HoldToDelete({ label, onConfirm, ms = 900 }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef(null);
  const stop = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);
  const start = useCallback(() => {
    if (timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, ms);
  }, [onConfirm, ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      aria-label={tr("{label}. Ține apăsat ca să ștergi.", { label })}
      title={tr("Ține apăsat ca să ștergi")}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId); // keeps the hold when the finger drifts off the button
        } catch {
          // no active pointer (synthetic events): the hold still works without capture
        }
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={stop}
      onBlur={stop}
      onContextMenu={(e) => e.preventDefault()}
      className="focus-ring group relative grid h-9 w-9 shrink-0 touch-none select-none place-items-center overflow-hidden rounded-full border-2 border-rose bg-transparent text-rose transition-colors hover:bg-rose/15"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 origin-bottom bg-rose ease-linear"
        style={{ transform: `scaleY(${holding ? 1 : 0})`, transitionProperty: "transform", transitionDuration: holding ? `${ms}ms` : "150ms" }}
      />
      <Trash2 size={16} className={`relative transition-colors ${holding ? "text-on-rose" : ""}`} style={{ transitionDelay: holding ? `${Math.round(ms * 0.45)}ms` : "0ms" }} aria-hidden="true" />
    </button>
  );
}

// ------------------------------------------------------------ modal

export function Modal({ open, onClose, title, icon: Icon, tone = "violet", wide = false, dismissable = true, children, footer, labelledBy }) {
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && dismissable && !e.defaultPrevented) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.activeElement;
    requestAnimationFrame(() => (box.current?.querySelector("[data-autofocus]") || box.current?.querySelector("input, textarea, select, button"))?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, [open, dismissable, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/80 p-2 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose?.();
      }}
    >
      <div className={`anim-pop relative w-full ${wide ? "max-w-3xl" : "max-w-lg"}`}>
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
              <h2 className="font-display text-xl text-ink">{title}</h2>
              {dismissable && (
                <button type="button" onClick={onClose} aria-label={tr("Închide")} className="focus-ring ml-auto rounded-lg p-1.5 text-dim hover:bg-panel-hi hover:text-ink">
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

// the typed phrase counts when it matches ignoring case, diacritics and extra spaces
const plain = (t) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

// `phrase`: the player has to type this sentence before the button works (for things that cannot be undone)
export function Confirm({ open, title, children, confirmLabel = tr("Confirmă"), tone = "rose", phrase, onConfirm, onClose }) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  const ready = !phrase || plain(typed) === plain(phrase);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      tone={tone === "rose" ? "violet" : tone}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{tr("Renunță")}</Button>
          <Button variant={tone} onClick={onConfirm} disabled={!ready} data-autofocus={phrase ? undefined : true}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-body">{children}</div>
      {phrase && (
        <div className="mt-4">
          <label htmlFor="confirm-phrase" className="mb-1.5 block text-sm font-semibold text-body">{tr("Ca să continui, scrie: {span}", { span: <span className="font-extrabold text-ink">{phrase}</span> })}</label>
          <input
            id="confirm-phrase"
            className="field"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            data-autofocus
            placeholder={phrase}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) onConfirm();
            }}
          />
        </div>
      )}
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
            <div
              key={t.id}
              {...(t.onClick
                ? {
                    role: "button",
                    tabIndex: 0,
                    onClick: () => {
                      t.onClick();
                      setItems((x) => x.filter((y) => y.id !== t.id));
                    },
                    onKeyDown: (e) => e.key === "Enter" && e.currentTarget.click(),
                  }
                : {})}
              className={`panel ${TOAST[t.tone] || ""} anim-slide pointer-events-auto flex items-start gap-3 px-4 py-3 ${t.onClick ? "focus-ring cursor-pointer hover:brightness-110" : ""}`}
            >
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
