import * as Phaser from "phaser";
import {
  playCharacterMusic,
  pauseMusic,
  resumeMusic,
  stopMusic,
  startEngineLoop,
  stopEngine,
  setEngineIntensity,
  buttonTapSound,
  laneChangeSwish,
  soundShardChime,
  collisionSound,
  gridmasterWarning,
  victorySound,
  setAudioConfig,
  unlockAudio,
} from "./audio";
import type { HeroId } from "./audio";

// ---------------------------------------------------------------------------
// KekeVerse: Beat the Gridlock — Phaser 4 game module (flat layout)
// Portrait 540x960, 3-lane endless runner, procedural sprites + Web Audio.
// ---------------------------------------------------------------------------

export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;
export const LANES = [145, 270, 395];
export const PLAYER_Y = 760;

export type Phase =
  | "MENU"
  | "HERO_SELECT"
  | "DIFFICULTY_SELECT"
  | "TUTORIAL"
  | "PLAYING"
  | "PAUSED"
  | "GAME_OVER";

export type { HeroId };
export type DifficultyId = "warmup" | "pulse" | "rush";

// Event-name constants (single source of truth for both sides of the bridge)
export const EV_PHASE = "phase-changed";
export const EV_SCENE_READY = "current-scene-ready";
export const EV_HUD = "hud-updated";
export const EV_START = "start-gameplay";
export const EV_TOGGLE_PAUSE = "toggle-pause";
export const EV_RESTART = "restart-game";
export const EV_AUDIO_CONFIG = "audio-config";
/** QA/automation hook: deterministically fire the crash -> GAME_OVER flow. */
export const EV_TRIGGER_CRASH = "trigger-crash";

export interface HudPayload {
  score: number;
  distance: number;
  shards: number;
  difficulty: DifficultyId;
}

export const DIFFICULTIES: Record<
  DifficultyId,
  { label: string; speed: number; spacing: number; shardValue: number }
> = {
  warmup: { label: "Street Warm-Up", speed: 240, spacing: 520, shardValue: 2 },
  pulse: { label: "City Pulse", speed: 340, spacing: 380, shardValue: 4 },
  rush: { label: "Gridlock Rush", speed: 460, spacing: 290, shardValue: 6 },
};

// Re-export the UI-facing audio helpers so App.tsx has one import site.
export const uiClick = buttonTapSound;
export const applyAudioConfig = setAudioConfig;
export const beginAudio = unlockAudio;

// --- Procedural texture factory --------------------------------------------

function makeTextures(scene: Phaser.Scene) {
  const g = scene.add.graphics();

  // Road dash
  g.fillStyle(0xf2d64a, 1);
  g.fillRoundedRect(0, 0, 10, 46, 5);
  g.generateTexture("dash", 10, 46);
  g.clear();

  // Keke (overhead-angled tricycle). bodyColor = roof/body, accentColor = trim
  const keke = (key: string, body: number, accent: number) => {
    g.fillStyle(body, 1);
    g.fillRoundedRect(6, 10, 48, 68, 12); // main body
    g.fillStyle(accent, 1);
    g.fillRoundedRect(10, 4, 40, 20, 8); // roof front bar
    g.fillStyle(0x9fd8ff, 1);
    g.fillRoundedRect(12, 24, 36, 14, 4); // windshield
    g.fillStyle(0x22252e, 1);
    g.fillRoundedRect(0, 26, 8, 22, 3); // left wheel
    g.fillRoundedRect(52, 26, 8, 22, 3); // right wheel
    g.fillRoundedRect(24, 74, 12, 20, 4); // rear wheel
    g.fillStyle(0xffe9a8, 1);
    g.fillCircle(16, 76, 4);
    g.fillCircle(44, 76, 4); // headlights
    g.fillStyle(accent, 1);
    g.fillRect(14, 46, 32, 6); // handlebar
    g.fillStyle(0x2b2f3a, 1);
    g.fillCircle(30, 56, 7); // driver helmet
    g.generateTexture(key, 60, 94);
    g.clear();
  };
  keke("keke_tobi", 0xf4b942, 0x008751);
  keke("keke_chinedu", 0xff6b5e, 0x2b2f3a);
  keke("keke_sani", 0x1f3a6e, 0x18b5a0);

  // Barrier: striped construction barricade + warning lamp
  g.fillStyle(0x3a3f4c, 1);
  g.fillRoundedRect(4, 18, 88, 26, 4);
  for (let i = 0; i < 6; i++) {
    g.fillStyle(i % 2 === 0 ? 0xff8a3d : 0xffffff, 1);
    g.fillRect(8 + i * 14, 22, 12, 18);
  }
  g.fillStyle(0x2b2f3a, 1);
  g.fillRect(10, 44, 8, 14);
  g.fillRect(78, 44, 8, 14); // legs
  g.fillStyle(0xffd23f, 1);
  g.fillCircle(48, 12, 8); // lamp
  g.generateTexture("obs_barrier", 96, 60);
  g.clear();

  // Pothole: dark cracked crater
  g.fillStyle(0x0c0e16, 1);
  g.fillEllipse(32, 20, 60, 36);
  g.fillStyle(0x23273a, 1);
  g.fillEllipse(32, 18, 48, 26);
  g.lineStyle(2, 0x05060b, 1);
  g.lineBetween(8, 20, 20, 14);
  g.lineBetween(44, 26, 58, 20); // cracks
  g.generateTexture("obs_pothole", 64, 40);
  g.clear();

  // Sound Shard: glowing golden diamond with musical-note sparkle
  g.fillStyle(0xffe9a8, 0.35);
  g.fillCircle(16, 16, 15); // outer glow
  // QA FIX: drawn with fillTriangle instead of fillPoints(Vector2[]) — the
  // fillPoints path produced an empty/invalid "sound_shard" texture at
  // runtime, so shards rendered as Phaser's green missing-texture square.
  g.fillStyle(0xf4b942, 1);
  g.fillTriangle(16, 2, 28, 16, 16, 30); // diamond right half
  g.fillTriangle(16, 2, 4, 16, 16, 30); // diamond left half
  g.fillStyle(0xfff3cf, 1);
  g.fillTriangle(16, 7, 24, 16, 16, 25); // inner facet right
  g.fillTriangle(16, 7, 8, 16, 16, 25); // inner facet left
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(13, 12, 2.5); // sparkle
  g.generateTexture("sound_shard", 32, 32);
  g.clear();

  // Shard glow halo (additive)
  g.fillStyle(0xffd23f, 0.5);
  g.fillCircle(20, 20, 18);
  g.fillStyle(0xffe9a8, 0.8);
  g.fillCircle(20, 20, 10);
  g.generateTexture("sound_shard_glow", 40, 40);
  g.clear();

  // FX
  g.fillStyle(0xbfc4cf, 0.9);
  g.fillCircle(8, 8, 8);
  g.generateTexture("fx_smoke", 16, 16);
  g.clear();
  g.fillStyle(0xffd23f, 1);
  g.fillTriangle(8, 0, 16, 8, 8, 16);
  g.fillTriangle(0, 8, 8, 0, 8, 16);
  g.generateTexture("fx_spark", 16, 16);
  g.clear();
  g.fillStyle(0x8a6f4d, 0.8);
  g.fillCircle(5, 5, 5);
  g.generateTexture("fx_dust", 10, 10);
  g.clear();

  // Juice FX: expanding gold pulse ring (strokes only so the center stays
  // transparent — additive-blended for the lane-change speed trail).
  g.lineStyle(4, 0xffd23f, 1);
  g.strokeCircle(24, 24, 20);
  g.generateTexture("fx_ring", 48, 48);
  g.clear();

  // Juice FX: confetti chips for the victory celebration.
  g.fillStyle(0xffd23f, 1);
  g.fillRect(0, 0, 8, 5);
  g.generateTexture("fx_confetti", 8, 5);
  g.clear();
  g.destroy();
}

// --- Main gameplay scene ------------------------------------------------------

interface Obstacle extends Phaser.Physics.Arcade.Sprite {
  lane: number;
  kind: "barrier" | "pothole";
}

interface Shard extends Phaser.Physics.Arcade.Sprite {
  lane: number;
  glow?: Phaser.GameObjects.Image;
}

export class Game extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private shards!: Phaser.Physics.Arcade.StaticGroup;
  private dashes!: Phaser.GameObjects.Group;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private phase: Phase = "MENU";
  private running = false;
  private laneIndex = 1;
  private speed = 240;
  private spacing = 520;
  private distance = 0;
  private score = 0;
  private shardsCollected = 0;
  private spawnAcc = 0;
  private shardAcc = 0;
  private hudAcc = 0;
  private difficulty: DifficultyId = "warmup";
  private hero: HeroId = "tobi";
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerActive = false;
  private warningCooldown = 0;
  private enginePulseAcc = 0;
  /** Persistent in-canvas banners (READY..GO! / GAME OVER) — cleared on restart. */
  private bannerLayer: Phaser.GameObjects.Container | null = null;

  constructor() {
    super("Game");
  }

  create() {
    makeTextures(this);

    // Background + road
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x101220).setOrigin(0);
    this.add.rectangle(80, 0, 380, GAME_HEIGHT, 0x1a1c28).setOrigin(0, 0);
    // Curbs (Nigerian green + yellow edge lines)
    this.add.rectangle(74, 0, 12, GAME_HEIGHT, 0x008751).setOrigin(0, 0);
    this.add.rectangle(460, 0, 12, GAME_HEIGHT, 0x008751).setOrigin(0, 0);
    this.add.rectangle(86, 0, 4, GAME_HEIGHT, 0xf4b942).setOrigin(0, 0);
    this.add.rectangle(456, 0, 4, GAME_HEIGHT, 0xf4b942).setOrigin(0, 0);

    // Side scenery (simple flat blocks, not prison bars)
    for (let y = 40; y < GAME_HEIGHT; y += 160) {
      this.add.rectangle(38, y, 56, 96, 0x1d2338, 1).setOrigin(0.5, 0);
      this.add.rectangle(502, y + 70, 56, 96, 0x1d2338, 1).setOrigin(0.5, 0);
    }

    // Lane dashes (2 dividers)
    this.dashes = this.add.group();
    for (const lx of [207, 332]) {
      for (let y = -60; y < GAME_HEIGHT + 60; y += 120) {
        this.dashes.add(this.add.image(lx, y, "dash"), true);
      }
    }

    // Physics world
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Player keke
    this.player = this.physics.add.sprite(LANES[this.laneIndex], PLAYER_Y, "keke_tobi");
    this.player.setDepth(10);
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    pb.setSize(44, 76);
    pb.setOffset(8, 12);
    pb.setAllowGravity(false);
    this.player.setCollideWorldBounds(true);

    // Obstacle pool
    this.obstacles = this.physics.add.group();

    // Sound Shards (static group — never falls under gravity)
    this.shards = this.physics.add.staticGroup();

    this.physics.add.overlap(this.player, this.obstacles, (_a, b) => {
      if (!this.running) return;
      this.onCrash(b as Phaser.GameObjects.GameObject);
    });

    this.physics.add.overlap(this.player, this.shards, (_a, b) => {
      if (!this.running) return;
      this.onShardCollected(b as Shard);
    });

    // Keyboard
    this.keys = this.input.keyboard!.addKeys(
      "LEFT,RIGHT,A,D,ESC,P,ENTER,SPACE"
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on("keydown-ESC", () => this.togglePause());
    this.input.keyboard!.on("keydown-P", () => this.togglePause());

    // Swipe / touch
    this.input.addPointer(1);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.pointerActive = true;
      this.pointerDownX = p.x;
      this.pointerDownY = p.y;
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!this.pointerActive || !this.running) return;
      this.pointerActive = false;
      const dx = p.x - this.pointerDownX;
      const dy = p.y - this.pointerDownY;
      if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
        this.moveLane(dx > 0 ? 1 : -1);
      }
    });

    // React -> scene commands
    EventBus.on(EV_START, this.startRun, this);
    EventBus.on(EV_TOGGLE_PAUSE, this.setPaused, this);
    EventBus.on(EV_RESTART, this.restartRun, this);
    EventBus.on(EV_AUDIO_CONFIG, this.onAudioConfig, this);
    EventBus.on(EV_TRIGGER_CRASH, this.triggerCrash, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off(EV_START, this.startRun, this);
      EventBus.off(EV_TOGGLE_PAUSE, this.setPaused, this);
      EventBus.off(EV_RESTART, this.restartRun, this);
      EventBus.off(EV_AUDIO_CONFIG, this.onAudioConfig, this);
      EventBus.off(EV_TRIGGER_CRASH, this.triggerCrash, this);
      stopEngine();
      stopMusic();
    });

    EventBus.emit(EV_SCENE_READY, this);
  }

  update(time: number, delta: number) {
    if (!this.player || !this.player.active || !this.player.body) return;
    const dt = Math.min(delta, 50) / 1000;

    // Keyboard lane polling (edge-detected)
    if (this.running && this.phase === "PLAYING") {
      if (
        Phaser.Input.Keyboard.JustDown(this.keys.LEFT) ||
        Phaser.Input.Keyboard.JustDown(this.keys.A)
      )
        this.moveLane(-1);
      else if (
        Phaser.Input.Keyboard.JustDown(this.keys.RIGHT) ||
        Phaser.Input.Keyboard.JustDown(this.keys.D)
      )
        this.moveLane(1);
    }

    if (!this.running || this.phase !== "PLAYING") return;

    const s = this.speed * dt;

    // Engine intensity tracks speed (0..1)
    this.enginePulseAcc += dt;
    if (this.enginePulseAcc >= 0.25) {
      this.enginePulseAcc = 0;
      const maxSpeed = DIFFICULTIES.rush.speed;
      setEngineIntensity(Math.min(1, this.speed / maxSpeed));
    }

    // Scroll dashes
    this.dashes.getChildren().forEach((d) => {
      const img = d as Phaser.GameObjects.Image;
      img.y += s;
      if (img.y > GAME_HEIGHT + 60) img.y -= GAME_HEIGHT + 120;
    });

    // Move obstacles
    this.obstacles.getChildren().forEach((o) => {
      const ob = o as Obstacle;
      if (!ob.active) return;
      ob.y += s;
      if (ob.y > GAME_HEIGHT + 80) ob.disableBody(true, true);
    });

    // Move shards (static bodies need manual repositioning)
    this.shards.getChildren().forEach((c) => {
      const sh = c as Shard;
      if (!sh.active) return;
      sh.y += s;
      const body = sh.body as Phaser.Physics.Arcade.StaticBody;
      if (body) {
        body.updateFromGameObject();
        body.reset(sh.x, sh.y);
      }
      if (sh.y > GAME_HEIGHT + 60) sh.disableBody(true, true);
    });

    // Distance only — score increments strictly on Sound Shard pickup
    // (onShardCollected), never passively from distance travelled.
    this.distance += s * 0.12;

    // Spawn obstacles (initial clear buffer via spawnAcc start value)
    this.spawnAcc += s;
    if (this.spawnAcc >= this.spacing) {
      this.spawnAcc = 0;
      this.spawnWave();
    }

    // Spawn shards between waves
    this.shardAcc += s;
    if (this.shardAcc >= this.spacing * 0.55) {
      this.shardAcc = 0;
      this.spawnShards();
    }

    // Warning cooldown decay
    if (this.warningCooldown > 0) this.warningCooldown -= dt;

    // Throttled HUD emit (~10/s)
    this.hudAcc += dt;
    if (this.hudAcc >= 0.1) {
      this.hudAcc = 0;
      EventBus.emit(EV_HUD, {
        score: Math.floor(this.score),
        distance: Math.floor(this.distance),
        shards: this.shardsCollected,
        difficulty: this.difficulty,
      } as HudPayload);
    }
  }

  private spawnWave() {
    const count = Math.random() < 0.45 ? 2 : 1;
    const lanes = [0, 1, 2];
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    const chosen = lanes.slice(0, count); // never all 3 -> >=1 safe lane
    // Gridlock cluster warning: 2-obstacle barrier approaching
    if (count === 2 && this.warningCooldown <= 0) {
      gridmasterWarning();
      this.warningCooldown = 2.5;
    }
    for (const lane of chosen) {
      const kind: "barrier" | "pothole" =
        Math.random() < 0.55 ? "barrier" : "pothole";
      const key = kind === "barrier" ? "obs_barrier" : "obs_pothole";
      let ob = this.obstacles.get() as Obstacle | null;
      if (!ob) {
        ob = this.obstacles.create(
          LANES[lane],
          -80,
          key
        ) as unknown as Obstacle;
      } else {
        // Reuse the pooled sprite (get() may hand back an inactive child) —
        // creating a new one here would grow the group every wave.
        ob.enableBody(true, LANES[lane], -80, true, true);
        ob.setTexture(key);
        ob.setActive(true);
        ob.setVisible(true);
        ob.setAlpha(1);
        ob.setScale(1);
        ob.setAngle(0);
      }
      ob.lane = lane;
      ob.kind = kind;
      ob.setDepth(5);
      const b = ob.body as Phaser.Physics.Arcade.Body;
      b.setAllowGravity(false);
      if (kind === "barrier") {
        b.setSize(84, 34);
        b.setOffset(6, 16);
      } else {
        b.setSize(54, 32);
        b.setOffset(5, 4);
      }
    }
  }

  /** Spawn 1-2 glowing Sound Shards in lanes that are currently free. */
  private spawnShards() {
    const blocked = new Set<number>();
    this.obstacles.getChildren().forEach((o) => {
      const ob = o as Obstacle;
      if (ob.active && ob.y < 0 && ob.y > -GAME_HEIGHT) blocked.add(ob.lane);
    });
    const free = [0, 1, 2].filter((l) => !blocked.has(l));
    if (free.length === 0) return;
    const count = Math.random() < 0.4 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const lane = free[Math.floor(Math.random() * free.length)];
      const x = LANES[lane];
      const y = -60 - i * 90;
      let sh = this.shards.get() as Shard | null;
      if (!sh) {
        sh = this.shards.create(x, y, "sound_shard") as unknown as Shard;
      } else {
        // Reuse the pooled shard — creating a new one here would grow the
        // static group every spawn cycle.
        sh.enableBody(true, x, y, true, true);
        sh.setActive(true);
        sh.setVisible(true);
        sh.setAlpha(1);
        sh.setScale(1);
      }
      sh.lane = lane;
      sh.setDepth(4);
      const body = sh.body as Phaser.Physics.Arcade.StaticBody;
      if (body) {
        body.setSize(28, 28);
        body.setOffset(2, 2);
        body.reset(x, y);
      }
      // Kill any leftover tweens from a previous pooled life before adding new ones
      this.tweens.killTweensOf(sh);
      // Destroy any stale glow from a previous pooled life (its follow listener
      // self-removes on the next tick once the glow is inactive)
      if (sh.glow) {
        sh.glow.destroy();
        sh.glow = undefined;
      }
      // gentle pulse tween for the glow feel
      this.tweens.add({
        targets: sh,
        scaleX: 1.18,
        scaleY: 1.18,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
      // additive glow halo behind the shard
      const glow = this.add.image(x, y, "sound_shard_glow");
      glow.setBlendMode(Phaser.BlendModes.ADD);
      glow.setDepth(3);
      glow.setAlpha(0.7);
      this.tweens.add({
        targets: glow,
        alpha: 0.25,
        scale: 1.3,
        duration: 500,
        yoyo: true,
        repeat: -1,
      });
      // tie glow lifetime to shard via a follow update
      sh.glow = glow;
      const follow = () => {
        if (!sh || !sh.active || !glow.active) {
          this.tweens.killTweensOf(glow);
          if (glow.active) glow.destroy();
          if (sh && sh.glow === glow) sh.glow = undefined;
          this.events.off("update", follow);
          return;
        }
        glow.x = sh.x;
        glow.y = sh.y;
      };
      this.events.on("update", follow);
    }
  }

  private onShardCollected(sh: Shard) {
    if (!sh || !sh.active) return;
    const gained = DIFFICULTIES[this.difficulty].shardValue;
    // Juice: scale-pop (1.0 -> 1.25) + alpha fade-out (1.0 -> 0.0) on the shard
    // itself before its body is disabled, so the pickup reads as a satisfying
    // "burst" instead of an instant vanish. The body is disabled immediately so
    // the overlap never re-fires; the visual sprite keeps animating for ~240ms.
    this.tweens.killTweensOf(sh);
    if (sh.glow) {
      this.tweens.killTweensOf(sh.glow);
      if (sh.glow.active) sh.glow.destroy();
      sh.glow = undefined;
    }
    sh.setActive(false);
    sh.setVisible(true);
    sh.disableBody(false, false);
    this.tweens.add({
      targets: sh,
      scaleX: 1.25,
      scaleY: 1.25,
      alpha: 0,
      duration: 240,
      ease: "Quad.Out",
      // QA FIX: never destroy() a pooled static-group child. Destroying it
      // removed it from the group's children array while its StaticBody stayed
      // registered in the physics world — the orphaned body kept overlapping
      // the player and rendered as Phaser's green missing-texture wireframe
      // square near the top of the screen. Return it to the pool instead.
      onComplete: () => {
        this.tweens.killTweensOf(sh);
        if (sh.glow) {
          this.tweens.killTweensOf(sh.glow);
          if (sh.glow.active) sh.glow.destroy();
          sh.glow = undefined;
        }
        sh.setAlpha(1);
        sh.setScale(1);
        sh.setActive(false);
        sh.setVisible(false);
      },
    });
    this.score += gained;
    this.shardsCollected += 1;
    soundShardChime();
    // sparkle burst at pickup point
    this.add.particles(0, 0, "fx_spark", {
      speed: { min: 80, max: 200 },
      scale: { start: 0.8, end: 0 },
      lifespan: 420,
      emitting: false,
    }).explode(10, sh.x, sh.y);
    // Juice: expanding gold pulse ring at the pickup point
    const ring = this.add
      .image(sh.x, sh.y, "fx_ring")
      .setDepth(11)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.5)
      .setAlpha(0.9);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 320,
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });
    // Juice: floating score popup rising above the keke
    const pop = this.add
      .text(sh.x, sh.y - 18, "+" + gained, {
        fontFamily: "Arial, sans-serif",
        fontSize: "26px",
        fontStyle: "bold",
        color: "#ffd23f",
        stroke: "#1a1200",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(12);
    this.tweens.add({
      targets: pop,
      y: pop.y - 46,
      alpha: 0,
      scale: { from: 1.15, to: 0.9 },
      duration: 620,
      ease: "Quad.Out",
      onComplete: () => pop.destroy(),
    });
    // streak milestone removed (feature deprecated)
    EventBus.emit(EV_HUD, {
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      shards: this.shardsCollected,
      difficulty: this.difficulty,
    } as HudPayload);
  }

  private moveLane(dir: number) {
    const next = Math.min(2, Math.max(0, this.laneIndex + dir));
    if (next === this.laneIndex) return;
    const prevX = this.player.x;
    this.laneIndex = next;
    laneChangeSwish();
    this.tweens.add({
      targets: this.player,
      x: LANES[next],
      angle: dir * 7,
      duration: 140,
      ease: "Quad.Out",
      yoyo: false,
      onComplete: () => this.player.setAngle(0),
    });
    this.tweens.add({
      targets: this.player,
      angle: 0,
      duration: 120,
      delay: 140,
    });
    // Juice: brief additive gold speed trail at the old lane position.
    const trail = this.add
      .image(prevX, this.player.y, "fx_ring")
      .setDepth(9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.7)
      .setAlpha(0.4);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      scale: 1.3,
      duration: 180,
      ease: "Quad.Out",
      onComplete: () => trail.destroy(),
    });
  }

  /**
   * QA FIX: persistent in-canvas banner layer. The React overlay owns the
   * interactive screens, but automated visual checks capture the canvas —
   * without an in-scene banner the GAME_OVER / restart moments looked like
   * uninterrupted gameplay. Banners are raw game objects (not tweens) so they
   * survive a paused scene, and they are cleared on the next startRun.
   */
  private showBanner(lines: { text: string; size: number; color: string }[]) {
    this.clearBanner();
    const c = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT * 0.36).setDepth(40);
    const h = lines.length * 74;
    const bg = this.add
      .rectangle(0, 0, GAME_WIDTH - 48, h + 36, 0x0a0c16, 0.82)
      .setStrokeStyle(2, 0xffd23f, 0.85);
    c.add(bg);
    lines.forEach((l, i) => {
      const t = this.add
        .text(0, (i - (lines.length - 1) / 2) * 74, l.text, {
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: l.size + "px",
          fontStyle: "bold",
          color: l.color,
          stroke: "#000000",
          strokeThickness: 8,
        })
        .setOrigin(0.5);
      c.add(t);
    });
    this.bannerLayer = c;
  }

  private clearBanner() {
    if (this.bannerLayer) {
      this.bannerLayer.destroy();
      this.bannerLayer = null;
    }
  }

  private onCrash(obj: Phaser.GameObjects.GameObject) {
    if (!this.running) return;
    this.running = false;
    this.phase = "GAME_OVER";
    // In-canvas GAME OVER banner (persists until the next run starts).
    this.showBanner([
      { text: "GAME OVER", size: 54, color: "#ff5a4e" },
      { text: "GRIDLOCK!", size: 26, color: "#ffd23f" },
    ]);
    // Broadcast the phase FIRST so React shows the Game Over screen even if a
    // cosmetic effect below throws (juice must never block the transition).
    EventBus.emit(EV_HUD, {
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      shards: this.shardsCollected,
      difficulty: this.difficulty,
    } as HudPayload);
    EventBus.emit(EV_PHASE, "GAME_OVER" as Phase);
    try {
      collisionSound();
      stopEngine();
      pauseMusic();
      const o = obj as Phaser.GameObjects.Sprite;
      this.cameras.main.shake(260, 0.012);
      this.cameras.main.flash(180, 180, 40, 40);
      const ex = o?.x || this.player.x;
      const ey = o?.y || this.player.y;
      this.add.particles(0, 0, "fx_smoke", {
        speed: 90,
        scale: { start: 1.2, end: 0 },
        lifespan: 600,
        emitting: false,
      }).explode(14, ex, ey);
      this.add.particles(0, 0, "fx_spark", {
        speed: { min: 120, max: 260 },
        scale: { start: 0.9, end: 0 },
        lifespan: 400,
        emitting: false,
      }).explode(18, ex, ey);
    } catch {
      /* cosmetic-only: game-over transition already emitted above */
    }
  }

  // --- Public API used by React ---------------------------------------------

  startRun(data: { hero: HeroId; difficulty: DifficultyId }) {
    this.hero = data?.hero ?? this.hero;
    this.difficulty = data?.difficulty ?? this.difficulty;
    const cfg = DIFFICULTIES[this.difficulty];
    this.speed = cfg.speed;
    this.spacing = cfg.spacing;
    // QA FIX: distinct restart sequence — clear any GAME OVER banner and show
    // a brief READY… GO! countdown so a restart is visibly a fresh run.
    this.clearBanner();
    this.time.removeAllEvents();
    this.showBanner([{ text: "READY…", size: 48, color: "#9fd8ff" }]);
    this.time.delayedCall(700, () => {
      this.showBanner([{ text: "GO!", size: 64, color: "#7CFC00" }]);
    });
    this.time.delayedCall(1250, () => this.clearBanner());

    // Retry can arrive while PAUSED — always restore world & tweens first,
    // otherwise lane-change tweens stay frozen and the player cannot move.
    if (this.physics.world.isPaused) this.physics.world.resume();
    this.tweens.resumeAll();

    this.obstacles.getChildren().forEach((o) => {
      (o as Obstacle).disableBody(true, true);
    });
    this.shards.getChildren().forEach((c) => {
      (c as Shard).disableBody(true, true);
    });
    this.distance = 0;
    this.score = 0;
    this.shardsCollected = 0;
    this.spawnAcc = -this.spacing * 0.6; // clear-road buffer before first wave
    this.shardAcc = -this.spacing * 0.3;
    this.laneIndex = 1;
    this.player.setTexture("keke_" + this.hero);
    this.player.setPosition(LANES[1], PLAYER_Y);
    this.player.setAngle(0);
    this.running = true;
    this.phase = "PLAYING";
    // Audio: character music + engine loop start strictly on LET'S GO tap
    playCharacterMusic(this.hero);
    // Retry after a crash: playCharacterMusic early-returns when the same
    // hero loop is still alive, but onCrash ramped musicBus gain to ~0 via
    // pauseMusic(). Restore the bus so music is audible again on retry.
    resumeMusic();
    startEngineLoop();
    EventBus.emit(EV_PHASE, "PLAYING" as Phase);
    EventBus.emit(EV_HUD, {
      score: 0,
      distance: 0,
      shards: 0,
      difficulty: this.difficulty,
    } as HudPayload);
  }

  setPaused(paused: boolean) {
    if (this.phase !== "PLAYING" && this.phase !== "PAUSED") return;
    if (paused) {
      this.phase = "PAUSED";
      this.physics.world.pause();
      this.tweens.pauseAll();
      pauseMusic();
      stopEngine();
      EventBus.emit(EV_PHASE, "PAUSED" as Phase);
    } else {
      this.phase = "PLAYING";
      this.physics.world.resume();
      this.tweens.resumeAll();
      resumeMusic();
      startEngineLoop();
      EventBus.emit(EV_PHASE, "PLAYING" as Phase);
    }
  }

  private togglePause() {
    if (this.phase === "PLAYING") this.setPaused(true);
    else if (this.phase === "PAUSED") this.setPaused(false);
  }

  /**
   * `restart-game` means RESTART THE RUN (RETRY semantics) — it must resume
   * gameplay immediately, never fall back to the menu. The old behaviour
   * (reset to MENU-ready) froze the RETRY/restart flow on the menu screen.
   */
  restartRun() {
    this.startRun({ hero: this.hero, difficulty: this.difficulty });
  }

  /** Return the scene to its idle menu-ready state (no phase emit — React owns the MENU phase). */
  resetToReady() {
    this.running = false;
    this.phase = "MENU";
    this.obstacles.getChildren().forEach((o) => {
      (o as Obstacle).disableBody(true, true);
    });
    this.shards.getChildren().forEach((c) => {
      (c as Shard).disableBody(true, true);
    });
    if (this.physics.world.isPaused) this.physics.world.resume();
    this.tweens.resumeAll();
    stopEngine();
    stopMusic();
  }

  /** React -> scene: push music/sfx mute config into the audio engine. */
  private onAudioConfig(cfg: { music: boolean; sfx: boolean }) {
    setAudioConfig(cfg?.music ?? true, cfg?.sfx ?? true);
  }

  /**
   * Deterministic crash trigger (QA / programmatic use). Fires the full
   * collision-impact -> GAME_OVER flow even when no obstacle has reached
   * the player yet.
   */
  triggerCrash() {
    if (!this.running) return;
    const active = this.obstacles
      .getChildren()
      .filter((o) => (o as Obstacle).active) as Obstacle[];
    this.onCrash(active[0] ?? this.player);
  }

  /** Called by React when a new best score is achieved on GAME_OVER. */
  playVictory() {
    victorySound();
    // Juice: celebratory gold burst + confetti shower + soft pulse.
    this.add
      .particles(0, 0, "sound_shard_glow", {
        speed: { min: 120, max: 300 },
        scale: { start: 1.5, end: 0 },
        lifespan: 900,
        blendMode: "ADD",
        emitting: false,
      })
      .explode(24, this.player.x, this.player.y - 40);
    const conf = this.add.particles(0, 0, "fx_confetti", {
      x: { min: 0, max: GAME_WIDTH },
      speedY: { min: 120, max: 260 },
      speedX: { min: -40, max: 40 },
      angle: { min: 70, max: 110 },
      scale: { start: 1.2, end: 0.4 },
      rotate: { min: 0, max: 360 },
      lifespan: 1600,
      emitting: false,
    });
    conf.explode(40, GAME_WIDTH / 2, -20);
    this.time.delayedCall(1800, () => conf.destroy());
    const pulse = this.add
      .image(this.player.x, this.player.y, "fx_ring")
      .setDepth(11)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1)
      .setAlpha(0.85);
    this.tweens.add({
      targets: pulse,
      scale: 8,
      alpha: 0,
      duration: 700,
      ease: "Cubic.Out",
      onComplete: () => pulse.destroy(),
    });
  }
}

// --- Bootstrap factory ---------------------------------------------------------

export const StartGame = (parent: string) => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#101220",
    roundPixels: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    scene: [Game],
  });
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
    (window as unknown as Record<string, unknown>).__PHASER_EVENT_BUS__ = EventBus;
  }
  return game;
};

export const EventBus = new Phaser.Events.EventEmitter();

export default StartGame;