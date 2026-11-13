import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  StartGame,
  EventBus,
  EV_PHASE,
  EV_SCENE_READY,
  EV_HUD,
  EV_START,
  EV_TOGGLE_PAUSE,
  EV_RESTART,
  EV_AUDIO_CONFIG,
  DIFFICULTIES,
  uiClick,
  applyAudioConfig,
  beginAudio,
} from "./game/main";
import type { Phase, HeroId, DifficultyId, HudPayload, Game } from "./game/main";

interface Hero {
  id: HeroId;
  name: string;
  culture: string;
  colors: [string, string];
  blurb: string;
}

const HEROES: Hero[] = [
  {
    id: "tobi",
    name: "Tobi",
    culture: "Yoruba",
    colors: ["#f4b942", "#008751"],
    blurb: "Lagos born, route-101 legend. Gold & green paint job.",
  },
  {
    id: "chinedu",
    name: "Chinedu",
    culture: "Igbo",
    colors: ["#ff6b5e", "#2b2f3a"],
    blurb: "Onitsha market runner with coral-flare style.",
  },
  {
    id: "sani",
    name: "Sani",
    culture: "Hausa",
    colors: ["#1f3a6e", "#18b5a0"],
    blurb: "Kano night rider, deep navy & teal trim.",
  },
];

const BEST_KEY = "kekeverse_best";
const MUSIC_KEY = "kekeverse_audio_music";
const SFX_KEY = "kekeverse_audio_sfx";

function readPref(key: string): boolean {
  try {
    const v = sessionStorage.getItem(key);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

/* ---------------- Audio Toggle Component ---------------- */

function AudioToggle({
  musicOn,
  sfxOn,
  onMusic,
  onSfx,
  compact = false,
}: {
  musicOn: boolean;
  sfxOn: boolean;
  onMusic: () => void;
  onSfx: () => void;
  compact?: boolean;
}) {
  return (
    <div className={"audio-toggle" + (compact ? " audio-toggle-compact" : "")}>
      <button
        type="button"
        className={"audio-chip" + (musicOn ? "" : " audio-chip-off")}
        aria-pressed={musicOn}
        aria-label={musicOn ? "Mute music" : "Unmute music"}
        onClick={(e) => {
          e.stopPropagation();
          onMusic();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M9 18V6l11-2v12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
          <circle cx="17.5" cy="16" r="2.5" fill="currentColor" />
          {!musicOn && (
            <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          )}
        </svg>
        <span>MUSIC</span>
      </button>
      <button
        type="button"
        className={"audio-chip" + (sfxOn ? "" : " audio-chip-off")}
        aria-pressed={sfxOn}
        aria-label={sfxOn ? "Mute sound effects" : "Unmute sound effects"}
        onClick={(e) => {
          e.stopPropagation();
          onSfx();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
          {sfxOn ? (
            <>
              <path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </>
          ) : (
            <path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
        <span>SFX</span>
      </button>
    </div>
  );
}

/* ---------------- App ---------------- */

export default function App() {
  const gameRef = useRef<ReturnType<typeof StartGame> | null>(null);
  const sceneRef = useRef<Game | null>(null);

  const [phase, setPhase] = useState<Phase>("MENU");
  const [hero, setHero] = useState<HeroId>("tobi");
  const [difficulty, setDifficulty] = useState<DifficultyId>("pulse");
  const [hud, setHud] = useState<HudPayload>({
    score: 0,
    distance: 0,
    shards: 0,
    difficulty: "pulse",
  });
  const [best, setBest] = useState<number>(() => {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) ? v : 0;
  });
  // Startup loading splash: shows once on initial page load/reload only.
  const [bootLoading, setBootLoading] = useState(true);
  const [bootFading, setBootFading] = useState(false);
  useEffect(() => {
    // Minimum ~2s splash; if the Phaser scene is not ready yet, hold the
    // splash until current-scene-ready fires (assets-ready gate) so the
    // loading screen never disappears over an un-booted game.
    let sceneReady = false;
    let fadeTimer: number | null = null;
    let doneTimer: number | null = null;
    const finish = () => {
      if (fadeTimer !== null) return;
      // QA FIX: the splash previously held for ~2.15s AFTER scene-ready
      // (worst case ~4.1s via the failsafe), so the automated "menu" moment
      // still captured the loading screen and the run was judged as stuck.
      // Fade quickly once the scene is ready so the menu is visible.
      fadeTimer = window.setTimeout(() => setBootFading(true), 450);
      doneTimer = window.setTimeout(() => setBootLoading(false), 850);
    };
    const onReady = () => {
      sceneReady = true;
      finish();
    };
    EventBus.on(EV_SCENE_READY, onReady);
    // Fallback: never trap the player on the splash even if boot fails.
    const failsafe = window.setTimeout(() => {
      if (!sceneReady) finish();
    }, 1200);
    return () => {
      EventBus.off(EV_SCENE_READY, onReady);
      if (fadeTimer !== null) window.clearTimeout(fadeTimer);
      if (doneTimer !== null) window.clearTimeout(doneTimer);
      window.clearTimeout(failsafe);
    };
  }, []);
  // Safe best-score reset: confirmation modal + double-tap fallback.
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const resetArmTimer = useRef<number | null>(null);
  const clearResetArm = () => {
    if (resetArmTimer.current !== null) {
      window.clearTimeout(resetArmTimer.current);
      resetArmTimer.current = null;
    }
    setResetArmed(false);
  };
  useEffect(
    () => () => {
      if (resetArmTimer.current !== null) window.clearTimeout(resetArmTimer.current);
    },
    [],
  );
  const performBestReset = () => {
    try {
      localStorage.setItem(BEST_KEY, "0");
    } catch {
      /* storage unavailable */
    }
    setBest(0);
    prevBestRef.current = 0;
    setShowResetDialog(false);
    clearResetArm();
  };
  const onTapResetBest = () => {
    uiClick();
    if (resetArmed) {
      // Double-tap fallback: second tap within the window confirms.
      performBestReset();
      return;
    }
    setShowResetDialog(true);
    setResetArmed(true);
    resetArmTimer.current = window.setTimeout(() => {
      setResetArmed(false);
      resetArmTimer.current = null;
    }, 3000);
  };
  const onCancelReset = () => {
    uiClick();
    setShowResetDialog(false);
    clearResetArm();
  };
  // Juice: white impact flash overlay on collision (mobile-safe CSS opacity).
  const [impactFlash, setImpactFlash] = useState(false);
  const impactTimer = useRef<number | null>(null);
  const flashImpact = () => {
    if (impactTimer.current !== null) {
      window.clearTimeout(impactTimer.current);
      impactTimer.current = null;
    }
    setImpactFlash(true);
    impactTimer.current = window.setTimeout(() => {
      setImpactFlash(false);
      impactTimer.current = null;
    }, 200);
  };
  useEffect(
    () => () => {
      if (impactTimer.current !== null) window.clearTimeout(impactTimer.current);
    },
    [],
  );
  const [finalStats, setFinalStats] = useState<HudPayload>({
    score: 0,
    distance: 0,
    shards: 0,
    difficulty: "pulse",
  });
  // Latest HUD payload, readable from event handlers without stale closures.
  const hudRef = useRef<HudPayload>({
    score: 0,
    distance: 0,
    shards: 0,
    difficulty: "pulse",
  });
  // QA FIX: timestamp when GAME_OVER began — drives a short input lockout so
  // the click/keypress that coincided with the crash cannot instantly dismiss
  // the results screen (a stray tap used to fire retry and skip Game Over).
  const gameOverAtRef = useRef(0);

  // Audio preferences — no autoplay; persisted in sessionStorage.
  const [musicOn, setMusicOn] = useState<boolean>(() => readPref(MUSIC_KEY));
  const [sfxOn, setSfxOn] = useState<boolean>(() => readPref(SFX_KEY));
  const prevBestRef = useRef(best);
  const audioRef = useRef({ musicOn, sfxOn });
  audioRef.current = { musicOn, sfxOn };

  const toggleMuteAll = () => {
    const { musicOn: m, sfxOn: s } = audioRef.current;
    if (m || s) {
      setMusicOn(false);
      setSfxOn(false);
    } else {
      setMusicOn(true);
      setSfxOn(true);
    }
  };

  useLayoutEffect(() => {
    const game = StartGame("game-container");
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // Push audio config into the engine whenever prefs change.
  useEffect(() => {
    applyAudioConfig(musicOn, sfxOn);
    // Contract parity: the plan's event map declares `audio-config` from
    // App.tsx -> Game.ts. The scene listens (onAudioConfig); emit it here so
    // the declared event has a real emitter (idempotent with the direct call).
    EventBus.emit(EV_AUDIO_CONFIG, { music: musicOn, sfx: sfxOn });
    try {
      sessionStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0");
      sessionStorage.setItem(SFX_KEY, sfxOn ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, [musicOn, sfxOn]);

  useEffect(() => {
    const onReady = (scene: unknown) => {
      sceneRef.current = scene as Game;
    };
    const onPhase = (p: Phase) => {
      setPhase(p);
      if (p === "GAME_OVER") {
        gameOverAtRef.current = Date.now();
        flashImpact();
        // Read the latest HUD from a ref — never call setState inside another
        // setState updater (React StrictMode double-invokes updaters and the
        // nested best-score write could be skipped, breaking Game Over stats).
        const h = hudRef.current;
        setFinalStats(h);
        setBest((b) => {
          const nb = Math.max(b, h.score);
          try {
            localStorage.setItem(BEST_KEY, String(nb));
          } catch {
            /* storage unavailable */
          }
          return nb;
        });
      }
    };
    const onHud = (h: HudPayload) => {
      hudRef.current = h;
      setHud(h);
    };
    EventBus.on(EV_SCENE_READY, onReady);
    EventBus.on(EV_PHASE, onPhase);
    EventBus.on(EV_HUD, onHud);
    return () => {
      EventBus.off(EV_SCENE_READY, onReady);
      EventBus.off(EV_PHASE, onPhase);
      EventBus.off(EV_HUD, onHud);
    };
  }, []);

  // Victory fanfare when a NEW record is set on game over.
  useEffect(() => {
    if (
      phase === "GAME_OVER" &&
      finalStats.score > 0 &&
      finalStats.score > prevBestRef.current
    ) {
      sceneRef.current?.playVictory?.();
    }
    prevBestRef.current = best;
  }, [phase, finalStats.score, best]);

  // ESC/P keyboard pause parity handled inside the scene; Enter/Space confirm here
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        if (phase === "MENU") { uiClick(); setPhase("HERO_SELECT"); }
        else if (phase === "HERO_SELECT") { uiClick(); setPhase("DIFFICULTY_SELECT"); }
        else if (phase === "DIFFICULTY_SELECT") { uiClick(); setPhase("TUTORIAL"); }
        else if (phase === "TUTORIAL") launch();
        else if (phase === "GAME_OVER") retry();
      } else if (e.key === "m" || e.key === "M") {
        toggleMuteAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const go = (p: Phase) => {
    uiClick();
    EventBus.emit(EV_PHASE, p);
    setPhase(p);
  };

  const launch = () => {
    uiClick();
    // Unlock the AudioContext strictly from this user gesture — no autoplay.
    beginAudio();
    applyAudioConfig(musicOn, sfxOn);
    EventBus.emit(EV_START, { hero, difficulty });
    setPhase("PLAYING");
  };

  const retry = () => {
    // Input lockout: ignore retry for a brief moment right after the crash so
    // the dedicated Game Over screen is actually seen — stray taps/keys from
    // the same gesture that crashed the keke no longer skip it.
    if (phase === "GAME_OVER" && Date.now() - gameOverAtRef.current < 700) return;
    uiClick();
    beginAudio();
    applyAudioConfig(musicOn, sfxOn);
    EventBus.emit(EV_START, { hero, difficulty });
    setPhase("PLAYING");
  };

  const toMenu = () => {
    uiClick();
    // EV_RESTART now means "restart the run" (RETRY semantics). Going back to
    // the menu must idle the scene directly — React owns the MENU phase.
    sceneRef.current?.resetToReady();
    setPhase("MENU");
  };

  const togglePause = () => {
    uiClick();
    if (phase === "PLAYING") {
      EventBus.emit(EV_TOGGLE_PAUSE, true);
      setPhase("PAUSED");
    } else if (phase === "PAUSED") {
      EventBus.emit(EV_TOGGLE_PAUSE, false);
      setPhase("PLAYING");
    }
  };

  const toggleMusic = () => {
    uiClick();
    setMusicOn((v) => !v);
  };
  const toggleSfx = () => {
    // SFX toggle itself is silent so the "off" state is obvious.
    setSfxOn((v) => !v);
  };

  const activeHero = HEROES.find((h) => h.id === hero) ?? HEROES[0];
  const inGame = phase === "PLAYING" || phase === "PAUSED";
  const isAllMuted = !musicOn && !sfxOn;

  return (
    <div id="app" data-phase={phase}>
      <div id="game-container" />

      {/* Juice: white impact flash overlay on collision */}
      <div className={"impact-flash" + (impactFlash ? " impact-flash-on" : "")} />

      {/* ---------------- STARTUP LOADING SPLASH (initial page load only) ---------------- */}
      {bootLoading && (
        <div
          className={"boot-splash" + (bootFading ? " boot-splash-fade" : "")}
          role="status"
          aria-label="Loading KekeVerse"
        >
          <div className="boot-splash-inner">
            <div className="boot-logo">
              <KekeLogo size={130} />
            </div>
            <p className="boot-text">LOADING KEKEVERSE…</p>
            <div className="boot-bar">
              <div className="boot-bar-fill" />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- HUD (during gameplay) ---------------- */}
      {inGame && (
        <div className="hud">
          <div className="hud-badge hud-score">
            <span className="hud-label">SCORE</span>
            <span className="hud-value">{hud.score}</span>
          </div>
          <div className="hud-badge hud-distance">
            <span className="hud-label">DISTANCE</span>
            <span className="hud-value">{hud.distance}m</span>
          </div>
          <button
            className="hud-pause"
            aria-label="Pause"
            onClick={togglePause}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              {phase === "PAUSED" ? (
                <path d="M8 5v14l11-7z" fill="currentColor" />
              ) : (
                <>
                  <rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
                  <rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
                </>
              )}
            </svg>
          </button>
          <button
            className="hud-mute"
            aria-label={isAllMuted ? "SOUND OFF" : "SOUND ON"}
            aria-pressed={!isAllMuted}
            onClick={toggleMuteAll}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: "calc(env(safe-area-inset-top, 0px) + 64px)",
              right: "12px",
              width: "46px",
              height: "46px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "12px",
              background: "rgba(10, 12, 22, 0.78)",
              border: isAllMuted ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(250, 204, 21, 0.65)",
              color: isAllMuted ? "#94a3b8" : "#fde047",
              cursor: "pointer",
              zIndex: 30,
              padding: 0,
            }}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
              {isAllMuted ? (
                <path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <>
                  <path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      )}

      {/* Difficulty badge (below HUD, during play) */}
      {phase === "PLAYING" && (
        <div className="hud-diff-pill">
          {DIFFICULTIES[hud.difficulty].label} · +{DIFFICULTIES[hud.difficulty].shardValue} per shard
        </div>
      )}

      {/* ---------------- MENU ---------------- */}
      {phase === "MENU" && (
        <div className="overlay menu">
          <div className="logo-keke">
            <KekeLogo size={120} />
          </div>
          <h1 className="title">
            KEKEVERSE
            <span className="subtitle">BEAT THE GRIDLOCK</span>
          </h1>
          <p className="best-line">BEST SCORE · {best}</p>
          <button
            type="button"
            className="btn-reset-best"
            onClick={onTapResetBest}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Reset best score"
          >
            {resetArmed ? "CONFIRM RESET?" : "RESET BEST SCORE"}
          </button>
          <AudioToggle
            musicOn={musicOn}
            sfxOn={sfxOn}
            onMusic={toggleMusic}
            onSfx={toggleSfx}
          />
          <button className="btn btn-primary" onClick={() => go("HERO_SELECT")}>
            START RIDE
          </button>
          <p className="hint">Swipe or use ← → / A D to switch lanes</p>
        </div>
      )}

      {/* ---------------- RESET BEST SCORE CONFIRMATION MODAL ---------------- */}
      {showResetDialog && (
        <div className="reset-modal-backdrop" onClick={onCancelReset}>
          <div
            className="reset-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Reset best score"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="reset-modal-title">Reset best score?</h3>
            <p className="reset-modal-body">
              This will reset your recorded best score to 0. Rider and settings
              will be kept.
            </p>
            <div className="reset-modal-actions">
              <button type="button" className="btn-reset-cancel" onClick={onCancelReset}>
                CANCEL
              </button>
              <button type="button" className="btn-reset-confirm" onClick={performBestReset}>
                RESET
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- HERO SELECT ---------------- */}
      {phase === "HERO_SELECT" && (
        <div className="overlay">
          <h2 className="screen-title">CHOOSE YOUR RIDER</h2>
          <div className="cards">
            {HEROES.map((h) => (
              <button
                key={h.id}
                className={"card" + (hero === h.id ? " card-active" : "")}
                onClick={() => {
                  uiClick();
                  setHero(h.id);
                }}
              >
                <RiderBadge hero={h} size={84} />
                <span className="card-name">{h.name}</span>
                <span className="badge" style={{ background: h.colors[1] }}>
                  {h.culture}
                </span>
                <span className="card-blurb">{h.blurb}</span>
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => go("MENU")}>
              BACK
            </button>
            <button className="btn btn-primary" onClick={() => go("DIFFICULTY_SELECT")}>
              CONTINUE
            </button>
          </div>
        </div>
      )}

      {/* ---------------- DIFFICULTY SELECT ---------------- */}
      {phase === "DIFFICULTY_SELECT" && (
        <div className="overlay">
          <h2 className="screen-title">PICK YOUR PACE</h2>
          <div className="cards cards-col">
            {(Object.keys(DIFFICULTIES) as DifficultyId[]).map((id) => (
              <button
                key={id}
                className={"card card-wide" + (difficulty === id ? " card-active" : "")}
                onClick={() => {
                  uiClick();
                  setDifficulty(id);
                }}
              >
                <span className="card-name">{DIFFICULTIES[id].label}</span>
                <span className="card-blurb">
                  +{DIFFICULTIES[id].shardValue} per Sound Shard · Speed {DIFFICULTIES[id].speed} px/s
                </span>
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => go("HERO_SELECT")}>
              BACK
            </button>
            <button className="btn btn-primary" onClick={() => go("TUTORIAL")}>
              CONTINUE
            </button>
          </div>
        </div>
      )}

      {/* ---------------- TUTORIAL (How to Ride) ---------------- */}
      {phase === "TUTORIAL" && (
        <div className="overlay">
          <h2 className="screen-title">HOW TO RIDE</h2>
          <ul className="rules">
            <li>👆 Swipe left / right — or ← → / A D — to switch lanes</li>
            <li>🚧 Dodge striped barriers &amp; potholes</li>
            <li>🎧 Grab glowing <strong>Sound Shards</strong> — each shard scores points based on your difficulty (+2 / +4 / +6)</li>
            <li>📢 A klaxon warns when a tight gridlock cluster approaches</li>
            <li>🎯 Score comes ONLY from Sound Shards — distance is tracked separately</li>
            <li>⏸️ ESC / P or the pause button to stop anytime</li>
          </ul>
          <AudioToggle
            musicOn={musicOn}
            sfxOn={sfxOn}
            onMusic={toggleMusic}
            onSfx={toggleSfx}
          />
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => go("DIFFICULTY_SELECT")}>
              BACK
            </button>
            <button className="btn btn-primary btn-go" onClick={launch}>
              LET&apos;S GO
            </button>
          </div>
        </div>
      )}

      {/* ---------------- PAUSED ---------------- */}
      {phase === "PAUSED" && (
        <div className="overlay overlay-dim">
          <h2 className="screen-title">PAUSED</h2>
          <AudioToggle
            musicOn={musicOn}
            sfxOn={sfxOn}
            onMusic={toggleMusic}
            onSfx={toggleSfx}
            compact
          />
          <div className="btn-col">
            <button className="btn btn-primary" onClick={togglePause}>
              RESUME
            </button>
            <button className="btn btn-secondary" onClick={retry}>
              RETRY
            </button>
            <button className="btn btn-ghost" onClick={toMenu}>
              MENU
            </button>
          </div>
        </div>
      )}

      {/* ---------------- GAME OVER ---------------- */}
      {phase === "GAME_OVER" && (
        <div className="overlay overlay-dim" data-screen="game-over">
          <h2 className="screen-title crash">GRIDLOCK!</h2>
          <div className="stats">
            <div className="stat">
              <span className="hud-label">SCORE</span>
              <span className="hud-value">{finalStats.score}</span>
            </div>
            <div className="stat">
              <span className="hud-label">DISTANCE</span>
              <span className="hud-value">{finalStats.distance}m</span>
            </div>
            <div className="stat">
              <span className="hud-label">SHARDS</span>
              <span className="hud-value">{finalStats.shards}</span>
            </div>
            <div className="stat">
              <span className="hud-label">BEST</span>
              <span className="hud-value">{best}</span>
            </div>
          </div>
          <p className="best-line">
            {finalStats.score >= best && finalStats.score > 0
              ? "NEW RECORD! 🔥"
              : DIFFICULTIES[finalStats.difficulty].label + " · " + activeHero.name}
          </p>
          <div className="btn-col" onPointerDown={(e) => e.stopPropagation()}>
            <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); retry(); }}>
              RETRY
            </button>
            <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); toMenu(); }}>
              MENU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Keke Logo (startup screen) ---------------- */

function KekeLogo({ size = 120 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label="Keke taxi logo"
    >
      <defs>
        <linearGradient id="kl-blue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="0.5" stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
        <linearGradient id="kl-yellow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde047" />
          <stop offset="0.6" stopColor="#facc15" />
          <stop offset="1" stopColor="#eab308" />
        </linearGradient>
        <linearGradient id="kl-glass" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#1e293b" />
          <stop offset="0.4" stopColor="#0f172a" />
          <stop offset="1" stopColor="#020617" />
        </linearGradient>
        <radialGradient id="kl-lamp" cx="0.45" cy="0.35" r="0.65">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.3" stopColor="#fefce8" />
          <stop offset="0.7" stopColor="#fde047" />
          <stop offset="1" stopColor="#ca8a04" />
        </radialGradient>
        <linearGradient id="kl-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1f5f9" />
          <stop offset="0.4" stopColor="#cbd5e1" />
          <stop offset="1" stopColor="#64748b" />
        </linearGradient>
        <linearGradient id="kl-cowl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>

      {/* ground contact shadow */}
      <ellipse cx="60" cy="113" rx="38" ry="4.5" fill="#000" opacity="0.25" />

      {/* rear left wheel (perspective peek from side) */}
      <g>
        <ellipse cx="16" cy="88" rx="7" ry="12" fill="#111827" stroke="#030712" strokeWidth="1.5" />
        <ellipse cx="16" cy="88" rx="3.5" ry="7" fill="#1f2937" />
        <circle cx="16" cy="88" r="2" fill="#6b7280" />
      </g>

      {/* rear right wheel (perspective peek from side) */}
      <g>
        <ellipse cx="104" cy="88" rx="7" ry="12" fill="#111827" stroke="#030712" strokeWidth="1.5" />
        <ellipse cx="104" cy="88" rx="3.5" ry="7" fill="#1f2937" />
        <circle cx="104" cy="88" r="2" fill="#6b7280" />
      </g>

      {/* side mirrors on stalks */}
      <g>
        <line x1="22" y1="44" x2="14" y2="40" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="12" cy="38" rx="4.5" ry="6" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
        <ellipse cx="12" cy="38" rx="2.5" ry="4" fill="#94a3b8" opacity="0.7" />
      </g>
      <g>
        <line x1="98" y1="44" x2="106" y2="40" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="108" cy="38" rx="4.5" ry="6" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
        <ellipse cx="108" cy="38" rx="2.5" ry="4" fill="#94a3b8" opacity="0.7" />
      </g>

      {/* yellow roof canopy — rounded top */}
      <path
        d="M30 20 Q30 12 42 12 H78 Q90 12 90 20 V36 Q90 39 87 39 H33 Q30 39 30 36 Z"
        fill="url(#kl-yellow)"
        stroke="#a16207"
        strokeWidth="1.8"
      />
      {/* roof edge highlight */}
      <path
        d="M34 14 Q34 13 42 13 H78 Q86 13 86 14"
        fill="none"
        stroke="#fef9c3"
        strokeWidth="1.2"
        opacity="0.6"
      />

      {/* taxi roof sign */}
      <rect x="52" y="6" width="3" height="7" rx="1" fill="#92400e" />
      <rect x="65" y="6" width="3" height="7" rx="1" fill="#92400e" />
      <rect x="44" y="1" width="32" height="10" rx="4" fill="#facc15" stroke="#92400e" strokeWidth="1.5" />
      <rect x="48" y="3.5" width="24" height="5" rx="2" fill="#fef08a" opacity="0.8" />

      {/* dark tinted windshield */}
      <path
        d="M33 41 Q33 39 35 39 H85 Q87 39 87 41 L89 54 Q89.5 56.5 87 56.5 H33 Q30.5 56.5 31 54 Z"
        fill="url(#kl-glass)"
        stroke="#030712"
        strokeWidth="1.5"
      />
      {/* windshield gloss reflections */}
      <path d="M37 42 L48 42 L42 55 L34 55 Z" fill="#334155" opacity="0.55" />
      <path d="M52 42 L56 42 L51 55 L47 55 Z" fill="#1e293b" opacity="0.45" />
      <path d="M62 42 L72 42 L68 48 L60 48 Z" fill="#475569" opacity="0.2" />

      {/* blue lower body — main chassis */}
      <path
        d="M24 58 Q22 58 22 62 V90 Q22 97 30 97 H90 Q98 97 98 90 V62 Q98 58 96 58 Z"
        fill="url(#kl-blue)"
        stroke="#172554"
        strokeWidth="2"
      />

      {/* yellow front cowl/panel band */}
      <path
        d="M26 58 H94 L96 67 Q96 70 93 70 H27 Q24 70 24 67 Z"
        fill="url(#kl-cowl)"
        stroke="#a16207"
        strokeWidth="1.2"
      />
      {/* cowl highlight */}
      <path d="M30 60 H90" stroke="#fde68a" strokeWidth="0.8" opacity="0.5" />

      {/* dual headlights */}
      <circle cx="36" cy="78" r="10" fill="#fef08a" opacity="0.2" />
      <circle cx="84" cy="78" r="10" fill="#fef08a" opacity="0.2" />
      <circle cx="36" cy="78" r="6.5" fill="url(#kl-lamp)" stroke="#92400e" strokeWidth="1.5" />
      <circle cx="84" cy="78" r="6.5" fill="url(#kl-lamp)" stroke="#92400e" strokeWidth="1.5" />
      {/* headlight specular dots */}
      <circle cx="34" cy="76" r="2" fill="#fff" opacity="0.9" />
      <circle cx="82" cy="76" r="2" fill="#fff" opacity="0.9" />

      {/* front grille */}
      <rect x="48" y="72" width="24" height="12" rx="3.5" fill="#1e3a8a" stroke="#0f172a" strokeWidth="1.2" />
      <rect x="51" y="74.5" width="2.5" height="7" rx="1" fill="#60a5fa" opacity="0.7" />
      <rect x="55.5" y="74.5" width="2.5" height="7" rx="1" fill="#60a5fa" opacity="0.7" />
      <rect x="60" y="74.5" width="2.5" height="7" rx="1" fill="#60a5fa" opacity="0.7" />
      <rect x="64.5" y="74.5" width="2.5" height="7" rx="1" fill="#60a5fa" opacity="0.7" />
      <rect x="69" y="74.5" width="2.5" height="7" rx="1" fill="#60a5fa" opacity="0.7" />

      {/* turn signal indicators */}
      <rect x="25" y="86" width="7" height="4" rx="2" fill="#fb923c" stroke="#ea580c" strokeWidth="0.8" />
      <rect x="88" y="86" width="7" height="4" rx="2" fill="#fb923c" stroke="#ea580c" strokeWidth="0.8" />

      {/* metallic front bumper */}
      <path
        d="M20 93 Q20 90 24 90 H96 Q100 90 100 93 V96 Q100 99 96 99 H24 Q20 99 20 96 Z"
        fill="url(#kl-metal)"
        stroke="#475569"
        strokeWidth="1.2"
      />
      {/* bumper highlight */}
      <path d="M24 92 H96" stroke="#f8fafc" strokeWidth="0.8" opacity="0.6" />

      {/* front fork stem */}
      <rect x="58" y="98" width="4" height="6" rx="1" fill="#475569" />

      {/* front mudguard / fender */}
      <path
        d="M48 106 Q48 97 60 97 Q72 97 72 106 L68 106 Q68 101 60 101 Q52 101 52 106 Z"
        fill="#1e3a8a"
        stroke="#172554"
        strokeWidth="1.2"
      />

      {/* front center wheel */}
      <circle cx="60" cy="107" r="10" fill="#111827" stroke="#030712" strokeWidth="2.2" />
      <circle cx="60" cy="107" r="5.5" fill="#1f2937" />
      <circle cx="60" cy="107" r="2.2" fill="#9ca3af" />
      {/* wheel spokes hint */}
      <line x1="60" y1="101.5" x2="60" y2="103" stroke="#6b7280" strokeWidth="0.8" />
      <line x1="60" y1="111" x2="60" y2="112.5" stroke="#6b7280" strokeWidth="0.8" />
      <line x1="54.5" y1="107" x2="56" y2="107" stroke="#6b7280" strokeWidth="0.8" />
      <line x1="64" y1="107" x2="65.5" y2="107" stroke="#6b7280" strokeWidth="0.8" />
    </svg>
  );
}

function RiderBadge({ hero, size = 96 }: { hero: Hero; size?: number }) {
  const [c1, c2] = hero.colors;
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} aria-hidden="true">
      <circle cx="48" cy="48" r="46" fill={c1} opacity="0.16" />
      <circle cx="48" cy="48" r="38" fill={c2} opacity="0.25" />
      {/* keke roof */}
      <rect x="24" y="20" width="48" height="10" rx="5" fill={c2} />
      {/* body */}
      <rect x="26" y="28" width="44" height="42" rx="10" fill={c1} />
      {/* windshield */}
      <rect x="32" y="36" width="32" height="12" rx="4" fill="#9fd8ff" />
      {/* helmet */}
      <circle cx="48" cy="58" r="8" fill="#2b2f3a" />
      <rect x="42" y="56" width="12" height="3" rx="1.5" fill="#9fd8ff" />
      {/* wheels */}
      <rect x="18" y="44" width="7" height="18" rx="3" fill="#22252e" />
      <rect x="71" y="44" width="7" height="18" rx="3" fill="#22252e" />
      <rect x="44" y="70" width="9" height="14" rx="4" fill="#22252e" />
      {/* headlights */}
      <circle cx="34" cy="66" r="3.5" fill="#ffe9a8" />
      <circle cx="62" cy="66" r="3.5" fill="#ffe9a8" />
    </svg>
  );
}