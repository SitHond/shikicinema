import {
    ChangeDetectorRef,
    Component,
    NgZone,
    OnDestroy,
    OnInit,
    ViewEncapsulation,
    inject,
} from '@angular/core';

type GameType = 'snake' | 'tetris' | 'flappy' | 'physics';

interface PhysEl {
    el: HTMLElement;
    x: number; y: number;
    vx: number; vy: number;
    w: number; h: number;
    rot: number; rotV: number;
}

const TETRIS_PIECES = [
    { shape: [[1, 1, 1, 1]], color: '#22d3ee' },
    { shape: [[1, 1], [1, 1]], color: '#fbbf24' },
    { shape: [[0, 1, 0], [1, 1, 1]], color: '#a855f7' },
    { shape: [[0, 1, 1], [1, 1, 0]], color: '#4ade80' },
    { shape: [[1, 1, 0], [0, 1, 1]], color: '#f87171' },
    { shape: [[1, 0, 0], [1, 1, 1]], color: '#60a5fa' },
    { shape: [[0, 0, 1], [1, 1, 1]], color: '#fb923c' },
];

// Конами-код (в нижнем регистре, уже готово для сравнения)
const KONAMI_STR = 'arrowup,arrowup,arrowdown,arrowdown,arrowleft,arrowright,arrowleft,arrowright,b,a';

@Component({
    selector: 'app-secret-games',
    standalone: true,
    encapsulation: ViewEncapsulation.None,
    template: `
        @if (game && game !== 'physics') {
            <div class="sg-overlay" tabindex="0" role="application"
                (click)="onOverlayClick($event)" (keydown)="onOverlayClick($event)">
                <div class="sg-top-bar">
                    <span class="sg-game-name">{{ gameTitle }}</span>
                    <span class="sg-esc-hint">ESC — перезагрузить страницу</span>
                </div>
                <canvas #gc class="sg-canvas"></canvas>
                <div class="sg-score-bar">{{ score }}</div>
            </div>
        }
        @if (game === 'physics') {
            <button class="sg-phys-exit" (click)="exitReload()">✕ Выйти</button>
            <div class="sg-phys-hint">Физакс активен — перетаскивай элементы!</div>
        }
        @if (toast) {
            <div class="sg-toast">{{ toast }}</div>
        }
    `,
    styles: [`
        .sg-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.93);
            z-index: 100000;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 16px;
        }
        .sg-top-bar {
            display: flex; align-items: center; gap: 24px;
        }
        .sg-game-name {
            color: #fff; font-size: 1.3rem; font-weight: 700;
            letter-spacing: 3px; text-transform: uppercase;
        }
        .sg-esc-hint { color: rgba(255,255,255,0.35); font-size: 0.78rem; }
        .sg-canvas {
            image-rendering: pixelated;
            border: 2px solid rgba(255,255,255,0.12);
            border-radius: 6px; display: block;
        }
        .sg-score-bar {
            color: rgba(255,255,255,0.65); font-size: 0.9rem;
            min-height: 22px; font-family: monospace; letter-spacing: 1px;
        }
        .sg-phys-exit {
            position: fixed; top: 12px; right: 12px; z-index: 200000;
            background: rgba(20,20,20,0.9); color: #fff;
            border: 1px solid rgba(255,255,255,0.25); border-radius: 8px;
            padding: 8px 18px; cursor: pointer; font-size: 0.9rem;
            backdrop-filter: blur(8px);
        }
        .sg-phys-exit:hover { background: rgba(239,68,68,0.8); }
        .sg-phys-hint {
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            z-index: 200000; background: rgba(20,20,20,0.85); color: #a3e635;
            padding: 8px 20px; border-radius: 8px; font-size: 0.82rem;
            pointer-events: none; backdrop-filter: blur(8px);
        }
        .sg-toast {
            position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
            background: rgba(10,10,10,0.9); color: #fff;
            padding: 10px 22px; border-radius: 10px; font-size: 0.82rem;
            z-index: 300000; pointer-events: none; white-space: nowrap;
            animation: sg-toast-in 0.3s ease;
        }
        @keyframes sg-toast-in {
            from { opacity: 0; transform: translateX(-50%) translateY(12px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .sg-phys-body a,
        .sg-phys-body ion-router-link,
        .sg-phys-body [routerlink] { pointer-events: none !important; cursor: default !important; }
    `],
})
export class SecretGamesComponent implements OnInit, OnDestroy {
    game: GameType | null = null;
    gameTitle = '';
    score = '';
    toast = '';

    private readonly cdr = inject(ChangeDetectorRef);
    private readonly zone = inject(NgZone);

    // --- sequence detection ---
    private keyHist: string[] = [];
    private clickTimes: number[] = [];
    private tildeDown = 0;
    private tildeTimer = 0;

    // --- canvas ---
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private gameRaf = 0;

    // --- snake ---
    private snBody: {x:number, y:number}[] = [];
    private snDir = { x: 1, y: 0 };
    private snNextDir = { x: 1, y: 0 };
    private snFood = { x: 5, y: 5 };
    private snScore = 0;
    private snDead = false;

    // --- tetris ---
    private tetGrid: (string|null)[][] = [];
    private tetPiece: {shape:number[][], color:string, x:number, y:number}|null = null;
    private tetScore = 0;
    private tetDead = false;
    private tetInterval = 600;
    private tetLastDrop = 0;
    private readonly TW = 10;
    private readonly TH = 20;
    private readonly TCS = 28;

    // --- flappy ---
    private fbBird = { y: 240, vy: 0 };
    private fbPipes: {x:number, gap:number}[] = [];
    private fbScore = 0;
    private fbDead = false;
    private fbStarted = false;
    private fbPipeTimer = 0;
    private readonly FW = 320;
    private readonly FH = 480;

    // --- physics ---
    private physEls: PhysEl[] = [];
    private physRaf = 0;
    private dragging: PhysEl | null = null;
    private dragOX = 0;
    private dragOY = 0;

    private kd = (e: KeyboardEvent) => this.zone.run(() => this.onKeydown(e));
    private ku = (e: KeyboardEvent) => this.zone.run(() => this.onKeyup(e));
    private cl = (e: MouseEvent) => this.zone.run(() => this.onGlobalClick(e));
    private mm = (e: MouseEvent) => this.onMouseMove(e);
    private mu = () => this.onMouseUp();

    ngOnInit() {
        document.addEventListener('keydown', this.kd);
        document.addEventListener('keyup', this.ku);
        document.addEventListener('click', this.cl);
        document.addEventListener('mousemove', this.mm);
        document.addEventListener('mouseup', this.mu);
        console.log('[sg] SecretGames initialized. Konami→Snake | "tetris"→Tetris | 5clicks→Flappy | hold`→Physics');
    }

    ngOnDestroy() {
        document.removeEventListener('keydown', this.kd);
        document.removeEventListener('keyup', this.ku);
        document.removeEventListener('click', this.cl);
        document.removeEventListener('mousemove', this.mm);
        document.removeEventListener('mouseup', this.mu);
        this.cleanup();
    }

    // ── Входы ──────────────────────────────────────────────────────────────────

    private onKeydown(e: KeyboardEvent) {
        if (this.game) {
            if (e.key === 'Escape') {
                this.exitReload(); return;
            }
            this.handleGameKey(e);
            return;
        }

        // Физакс: зажать ` на 2 сек
        if ((e.key === '`' || e.key === '~') && !this.tildeDown) {
            this.tildeDown = Date.now();
            this.tildeTimer = window.setTimeout(() => {
                if (this.tildeDown) this.activateGame('physics');
            }, 2000);
        }

        this.pushKeyHist(e.key);
    }

    private onKeyup(e: KeyboardEvent) {
        if (e.key === '`' || e.key === '~') {
            this.tildeDown = 0;
            clearTimeout(this.tildeTimer);
        }
    }

    private onGlobalClick(_e: MouseEvent) {
        if (this.game) return;
        const now = Date.now();
        this.clickTimes = this.clickTimes.filter((t) => now - t < 2000);
        this.clickTimes.push(now);
        if (this.clickTimes.length >= 5) {
            this.clickTimes = [];
            this.activateGame('flappy');
        }
    }

    private pushKeyHist(key: string) {
        this.keyHist.push(key.toLowerCase());
        if (this.keyHist.length > 15) this.keyHist.shift();
        const h = this.keyHist.join(',');
        console.debug('[sg] keyHist:', h);

        if (h.endsWith(KONAMI_STR)) {
            this.keyHist = []; this.activateGame('snake'); return;
        }
        if (h.endsWith('t,e,t,r,i,s')) {
            this.keyHist = []; this.activateGame('tetris'); return;
        }
    }

    onOverlayClick(_e: MouseEvent | KeyboardEvent) {
        if (this.game === 'flappy') this.fbFlap();
    }

    exitReload() {
        location.reload();
    }

    // ── Активация ──────────────────────────────────────────────────────────────

    private activateGame(g: GameType) {
        console.log('[sg] activating:', g);
        this.game = g;

        const names: Record<GameType, string> = {
            snake: '🐍 Змейка',
            tetris: '🧱 Тетрис',
            flappy: '🐦 Флаппи Бёрд',
            physics: '💥 Физакс',
        };
        this.gameTitle = names[g];
        this.score = '';

        if (g === 'physics') {
            this.cdr.markForCheck();
            this.startPhysics();
            return;
        }

        this.cdr.markForCheck();
        setTimeout(() => this.setupCanvas(g), 60);
    }

    private setupCanvas(g: GameType) {
        this.canvas = document.querySelector<HTMLCanvasElement>('.sg-canvas');
        if (!this.canvas) {
            console.warn('[sg] canvas not found, retry'); setTimeout(() => this.setupCanvas(g), 50); return;
        }
        this.ctx = this.canvas.getContext('2d')!;
        switch (g) {
            case 'snake': this.startSnake(); break;
            case 'tetris': this.startTetris(); break;
            case 'flappy': this.startFlappy(); break;
        }
    }

    private handleGameKey(e: KeyboardEvent) {
        switch (this.game) {
            case 'snake': this.snakeKey(e); break;
            case 'tetris': this.tetrisKey(e); break;
            case 'flappy': this.flappyKey(e); break;
        }
    }

    // ── ЗМЕЙКА ────────────────────────────────────────────────────────────────

    private startSnake() {
        const C = 22; const W = 18; const H = 18;
        this.canvas!.width = W * C;
        this.canvas!.height = H * C;

        this.snBody = [{ x: 9, y: 9 }, { x: 8, y: 9 }, { x: 7, y: 9 }];
        this.snDir = this.snNextDir = { x: 1, y: 0 };
        this.snFood = { x: 3, y: 3 };
        this.snScore = 0;
        this.snDead = false;
        this.score = 'Очки: 0';
        this.cdr.markForCheck();

        let last = 0;
        const loop = (ts: number) => {
            if (ts - last > 140) {
                last = ts; this.snStep(W, H);
            }
            this.snDraw(W, H, C);
            if (!this.snDead) this.gameRaf = requestAnimationFrame(loop);
        };
        this.gameRaf = requestAnimationFrame(loop);
    }

    private snStep(W: number, H: number) {
        this.snDir = { ...this.snNextDir };
        const h = { x: this.snBody[0].x + this.snDir.x, y: this.snBody[0].y + this.snDir.y };

        if (h.x < 0 || h.x >= W || h.y < 0 || h.y >= H ||
            this.snBody.some((s) => s.x === h.x && s.y === h.y)) {
            this.snDead = true;
            this.score = `Очки: ${this.snScore}  —  Игра окончена  ⏎ ESC`;
            this.cdr.markForCheck();
            return;
        }

        this.snBody.unshift(h);
        if (h.x === this.snFood.x && h.y === this.snFood.y) {
            this.snScore++;
            this.score = `Очки: ${this.snScore}`;
            this.cdr.markForCheck();
            this.snFood = {
                x: Math.floor(Math.random() * W),
                y: Math.floor(Math.random() * H),
            };
        } else {
            this.snBody.pop();
        }
    }

    private snDraw(W: number, H: number, C: number) {
        const ctx = this.ctx!;
        ctx.fillStyle = '#0a0f1a';
        ctx.fillRect(0, 0, W*C, H*C);

        // сетка
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let i = 1; i < W; i++) {
            ctx.beginPath(); ctx.moveTo(i*C, 0); ctx.lineTo(i*C, H*C); ctx.stroke();
        }
        for (let i = 1; i < H; i++) {
            ctx.beginPath(); ctx.moveTo(0, i*C); ctx.lineTo(W*C, i*C); ctx.stroke();
        }

        // тело
        this.snBody.forEach((s, i) => {
            ctx.fillStyle = i === 0 ? '#4ade80' : `hsl(${140 - i*2}, 70%, ${45 - i*0.5}%)`;
            ctx.fillRect(s.x*C+2, s.y*C+2, C-4, C-4);
        });

        // еда
        ctx.fillStyle = '#f87171';
        ctx.shadowBlur = 10; ctx.shadowColor = '#f87171';
        ctx.beginPath();
        ctx.arc(this.snFood.x*C+C/2, this.snFood.y*C+C/2, C/2 - 3, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (this.snDead) {
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(0, 0, W*C, H*C);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 22px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', W*C/2, H*C/2);
        }
    }

    private snakeKey(e: KeyboardEvent) {
        const d = this.snDir;
        switch (e.key) {
            case 'ArrowUp': if (d.y !== 1) this.snNextDir = { x: 0, y: -1 }; break;
            case 'ArrowDown': if (d.y !== -1) this.snNextDir = { x: 0, y: 1 }; break;
            case 'ArrowLeft': if (d.x !== 1) this.snNextDir = { x: -1, y: 0 }; break;
            case 'ArrowRight': if (d.x !== -1) this.snNextDir = { x: 1, y: 0 }; break;
            default: return;
        }
        e.preventDefault();
    }

    // ── ТЕТРИС ────────────────────────────────────────────────────────────────

    private startTetris() {
        const { TW, TH, TCS } = this;
        this.canvas!.width = TW * TCS;
        this.canvas!.height = TH * TCS;

        this.tetGrid = Array.from({ length: TH }, () => Array(TW).fill(null));
        this.tetScore = 0;
        this.tetDead = false;
        this.tetInterval = 600;
        this.tetLastDrop = 0;
        this.score = 'Очки: 0  |  ↑/Z вращение  |  Space хардроп';
        this.spawnTet();
        this.cdr.markForCheck();

        const loop = (ts: number) => {
            if (!this.tetDead) {
                if (ts - this.tetLastDrop > this.tetInterval) {
                    this.tetLastDrop = ts;
                    this.tetDown();
                }
                this.tetDraw();
                this.gameRaf = requestAnimationFrame(loop);
            } else {
                this.tetDraw();
            }
        };
        this.gameRaf = requestAnimationFrame(loop);
    }

    private spawnTet() {
        const p = TETRIS_PIECES[Math.floor(Math.random() * TETRIS_PIECES.length)];
        this.tetPiece = { shape: p.shape.map((r) => [...r]), color: p.color, x: Math.floor(this.TW/2)-1, y: 0 };
    }

    private tetDown() {
        if (!this.tetPiece) return;
        this.tetPiece.y++;
        if (this.tetHits()) {
            this.tetPiece.y--; this.tetLock();
        }
    }

    private tetHits(px?: number, py?: number, shape?: number[][]): boolean {
        const p = this.tetPiece!;
        const rpx = px ?? p.x; const rpy = py ?? p.y; const rs = shape ?? p.shape;
        return rs.some((row, dy) => row.some((c, dx) => {
            if (!c) return false;
            const nx = rpx+dx; const ny = rpy+dy;
            return nx < 0 || nx >= this.TW || ny >= this.TH || ny >= 0 && !!this.tetGrid[ny][nx];
        }));
    }

    private tetLock() {
        const p = this.tetPiece!;
        p.shape.forEach((row, dy) => row.forEach((c, dx) => {
            if (c && p.y+dy >= 0) this.tetGrid[p.y+dy][p.x+dx] = p.color;
        }));

        let cleared = 0;
        for (let r = this.TH-1; r >= 0; r--) {
            if (this.tetGrid[r].every(Boolean)) {
                this.tetGrid.splice(r, 1);
                this.tetGrid.unshift(Array(this.TW).fill(null));
                cleared++; r++;
            }
        }
        if (cleared) {
            this.tetScore += [0, 100, 300, 500, 800][Math.min(cleared, 4)];
            this.tetInterval = Math.max(100, 600 - this.tetScore * 0.3);
            this.score = `Очки: ${this.tetScore}`;
            this.cdr.markForCheck();
        }

        this.spawnTet();
        if (this.tetHits()) {
            this.tetDead = true;
            this.score = `Очки: ${this.tetScore}  —  Игра окончена  ⏎ ESC`;
            this.cdr.markForCheck();
        }
    }

    private tetRotate() {
        if (!this.tetPiece) return;
        const old = this.tetPiece.shape;
        const rows = old.length; const cols = old[0].length;
        const rot = Array.from({ length: cols }, (_, i) =>
            Array.from({ length: rows }, (_, j) => old[rows-1-j][i]),
        );
        const prev = this.tetPiece.shape;
        this.tetPiece.shape = rot;
        const offsets = [0, -1, 1, -2, 2];
        for (const o of offsets) {
            this.tetPiece.x += o;
            if (!this.tetHits()) return;
            this.tetPiece.x -= o;
        }
        this.tetPiece.shape = prev;
    }

    private tetDraw() {
        const { TW, TH, TCS } = this;
        const ctx = this.ctx!;
        ctx.fillStyle = '#0a0f1a';
        ctx.fillRect(0, 0, TW*TCS, TH*TCS);

        // точечная сетка
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let r = 0; r < TH; r++) {
            for (let c = 0; c < TW; c++) {
                ctx.fillRect(c*TCS+TCS/2-1, r*TCS+TCS/2-1, 2, 2);
            }
        }

        // уложенные блоки
        this.tetGrid.forEach((row, r) => row.forEach((col, c) => {
            if (!col) return;
            ctx.fillStyle = col;
            ctx.fillRect(c*TCS+1, r*TCS+1, TCS-2, TCS-2);
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(c*TCS+1, r*TCS+1, TCS-2, 4);
        }));

        if (this.tetPiece && !this.tetDead) {
            const p = this.tetPiece;
            // тень (ghost)
            let gy = p.y;
            while (!this.tetHits(p.x, gy + 1, p.shape)) gy++;
            p.shape.forEach((row, dy) => row.forEach((c, dx) => {
                if (c && gy+dy >= 0) {
                    ctx.fillStyle = 'rgba(255,255,255,0.08)';
                    ctx.fillRect((p.x+dx)*TCS+1, (gy+dy)*TCS+1, TCS-2, TCS-2);
                }
            }));

            // текущая фигура
            p.shape.forEach((row, dy) => row.forEach((c, dx) => {
                if (c && p.y+dy >= 0) {
                    ctx.fillStyle = p.color;
                    ctx.fillRect((p.x+dx)*TCS+1, (p.y+dy)*TCS+1, TCS-2, TCS-2);
                    ctx.fillStyle = 'rgba(255,255,255,0.22)';
                    ctx.fillRect((p.x+dx)*TCS+1, (p.y+dy)*TCS+1, TCS-2, 4);
                }
            }));
        }

        if (this.tetDead) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, 0, TW*TCS, TH*TCS);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 26px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', TW*TCS/2, TH*TCS/2);
        }
    }

    private tetrisKey(e: KeyboardEvent) {
        if (!this.tetPiece || this.tetDead) return;
        switch (e.key) {
            case 'ArrowLeft': this.tetPiece.x--; if (this.tetHits()) this.tetPiece.x++; break;
            case 'ArrowRight': this.tetPiece.x++; if (this.tetHits()) this.tetPiece.x--; break;
            case 'ArrowDown': this.tetDown(); break;
            case 'ArrowUp': case 'z': case 'Z': this.tetRotate(); break;
            case ' ':
                while (!this.tetHits(this.tetPiece.x, this.tetPiece.y+1)) this.tetPiece.y++;
                this.tetLock();
                break;
            default: return;
        }
        e.preventDefault();
    }

    // ── ФЛАППИ БЁРД ───────────────────────────────────────────────────────────

    private startFlappy() {
        const { FW, FH } = this;
        this.canvas!.width = FW;
        this.canvas!.height = FH;

        this.fbBird = { y: FH/2, vy: 0 };
        this.fbPipes = [];
        this.fbScore = 0;
        this.fbDead = false;
        this.fbStarted = false;
        this.fbPipeTimer = 0;
        this.score = 'Space или клик — старт';
        this.cdr.markForCheck();

        let last = performance.now();
        const loop = (ts: number) => {
            const dt = Math.min((ts - last) / 1000, 0.05);
            last = ts;
            this.fbUpdate(dt, FW, FH);
            this.fbDraw(FW, FH);
            if (!this.fbDead) this.gameRaf = requestAnimationFrame(loop);
            else {
                this.fbDraw(FW, FH);
            }
        };
        this.gameRaf = requestAnimationFrame(loop);
    }

    private fbFlap() {
        if (this.fbDead) return;
        this.fbStarted = true;
        this.fbBird.vy = -420;
    }

    private fbUpdate(dt: number, W: number, H: number) {
        if (!this.fbStarted || this.fbDead) return;

        const GRAVITY = 1200; const PIPE_W = 52; const GAP = H * 0.34; const SPEED = 190;

        this.fbBird.vy += GRAVITY * dt;
        this.fbBird.y += this.fbBird.vy * dt;

        this.fbPipeTimer += dt;
        if (this.fbPipeTimer > 1.6) {
            this.fbPipeTimer = 0;
            this.fbPipes.push({ x: W, gap: 70 + Math.random() * (H - 140 - GAP) });
        }

        this.fbPipes.forEach((p) => p.x -= SPEED * dt);

        for (const p of this.fbPipes) {
            if (p.x + PIPE_W < 60 && p.x + PIPE_W + SPEED*dt >= 60) {
                this.fbScore++;
                this.score = `Очки: ${this.fbScore}`;
                this.cdr.markForCheck();
            }
        }
        this.fbPipes = this.fbPipes.filter((p) => p.x > -PIPE_W - 10);

        // коллизии
        const bx = 60; const by = this.fbBird.y; const br = 13; const GAP_ = GAP;
        if (by - br < 0 || by + br > H - 30) {
            this.fbDead = true;
            this.score = `Очки: ${this.fbScore}  —  Игра окончена  ⏎ ESC`;
            this.cdr.markForCheck();
            return;
        }
        for (const p of this.fbPipes) {
            if (bx + br > p.x && bx - br < p.x + PIPE_W) {
                if (by - br < p.gap || by + br > p.gap + GAP_) {
                    this.fbDead = true;
                    this.score = `Очки: ${this.fbScore}  —  Игра окончена  ⏎ ESC`;
                    this.cdr.markForCheck();
                    return;
                }
            }
        }
    }

    private fbDraw(W: number, H: number) {
        const ctx = this.ctx!;
        const GAP = H * 0.34; const PIPE_W = 52;

        // небо
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#1a2744');
        sky.addColorStop(1, '#2d6fa3');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // трубы
        this.fbPipes.forEach((p) => {
            ctx.fillStyle = '#3d8b37';
            ctx.fillRect(p.x, 0, PIPE_W, p.gap);
            ctx.fillRect(p.x, p.gap + GAP, PIPE_W, H - p.gap - GAP);
            ctx.fillStyle = '#2d6b28';
            ctx.fillRect(p.x - 5, p.gap - 22, PIPE_W + 10, 22);
            ctx.fillRect(p.x - 5, p.gap + GAP, PIPE_W + 10, 22);
        });

        // земля
        ctx.fillStyle = '#7a5c1e';
        ctx.fillRect(0, H - 30, W, 30);
        ctx.fillStyle = '#3d8b37';
        ctx.fillRect(0, H - 36, W, 10);

        // птица
        const by = this.fbBird.y;
        ctx.save();
        ctx.translate(60, by);
        ctx.rotate(Math.min(Math.max(this.fbBird.vy / 750, -0.5), 0.9));
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.ellipse(0, 0, 15, 11, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.ellipse(11, 2, 6, 4, 0.2, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(3, -4, 5, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(5, -4, 2.5, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        if (!this.fbStarted && !this.fbDead) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(W/2 - 120, H/2 - 18, 240, 36);
            ctx.fillStyle = '#fff';
            ctx.font = '15px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('Space / клик — лети!', W/2, H/2 + 6);
        }

        if (this.fbDead) {
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 26px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', W/2, H/2);
        }
    }

    private flappyKey(e: KeyboardEvent) {
        if (e.key === ' ' || e.key === 'ArrowUp') {
            this.fbFlap(); e.preventDefault();
        }
    }

    // ── ФИЗАКС ────────────────────────────────────────────────────────────────

    private startPhysics() {
        document.body.classList.add('sg-phys-body');

        const sel = [
            'ion-card', 'ion-item', '.card', 'ion-img', 'img',
            'ion-router-outlet > *', 'app-header', '.root__header',
            'ion-thumbnail', 'ion-label', 'ion-badge',
        ].join(',');

        let candidates = Array.from(document.querySelectorAll<HTMLElement>(sel))
            .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 20 && r.height > 10 &&
                    r.bottom > 0 && r.top < window.innerHeight &&
                    !el.closest('app-secret-games');
            })
            .slice(0, 40);

        // fallback — прямые дети body
        if (candidates.length < 3) {
            candidates = Array.from(document.body.children)
                .filter((e): e is HTMLElement => e instanceof HTMLElement && !e.matches('app-secret-games'))
                .slice(0, 40);
        }

        this.physEls = candidates.map((el) => {
            const r = el.getBoundingClientRect();
            el.style.cssText += `;
                position:fixed!important;
                top:${r.top}px; left:${r.left}px;
                width:${r.width}px; margin:0!important;
                transition:none!important; transform:none!important;
                z-index:${9000 + Math.floor(Math.random()*200)};
                cursor:grab; box-shadow:0 8px 32px rgba(0,0,0,0.5);
            `;
            return {
                el, x: r.left, y: r.top,
                vx: (Math.random() - 0.5) * 8,
                vy: -Math.random() * 4,
                w: r.width, h: r.height,
                rot: 0, rotV: (Math.random() - 0.5) * 3,
            };
        });

        // запрет кликов по ссылкам
        document.querySelectorAll<HTMLElement>('a, [routerlink], ion-back-button').forEach((a) => {
            a.dataset['sgPe'] = a.style.pointerEvents;
            a.style.pointerEvents = 'none';
        });

        this.physEls.forEach((p) => {
            p.el.addEventListener('mousedown', (e: MouseEvent) => {
                this.dragging = p;
                this.dragOX = e.clientX - p.x;
                this.dragOY = e.clientY - p.y;
                p.el.style.cursor = 'grabbing';
                e.preventDefault();
            });
        });

        this.cdr.markForCheck();
        this.physLoop();
    }

    private physLoop() {
        const G = 900; const BOUNCE = 0.5; const FRIC = 0.88;
        let last = 0;

        const step = (ts: number) => {
            const dt = Math.min((ts - last) / 1000, 0.05);
            last = ts;

            if (dt > 0) {
                const W = window.innerWidth; const H = window.innerHeight;
                for (const p of this.physEls) {
                    if (p === this.dragging) continue;

                    p.vy += G * dt;
                    p.x += p.vx;
                    p.y += p.vy * dt;
                    p.rot += p.rotV;

                    // пол
                    if (p.y + p.h > H) {
                        p.y = H - p.h; p.vy *= -BOUNCE; p.vx *= FRIC;
                        p.rotV *= 0.6;
                        if (Math.abs(p.vx) < 0.5) p.vx = 0;
                    }
                    // потолок
                    if (p.y < 0) {
                        p.y = 0; p.vy = Math.abs(p.vy) * BOUNCE;
                    }
                    // стены
                    if (p.x < 0) {
                        p.x = 0; p.vx = Math.abs(p.vx) * BOUNCE; p.rotV *= -0.7;
                    }
                    if (p.x + p.w > W) {
                        p.x = W - p.w; p.vx = -Math.abs(p.vx) * BOUNCE; p.rotV *= -0.7;
                    }

                    p.el.style.top = p.y + 'px';
                    p.el.style.left = p.x + 'px';
                    if (Math.abs(p.rot) > 0.01) {
                        p.el.style.transform = `rotate(${p.rot}deg)`;
                    }
                }
            }

            this.physRaf = requestAnimationFrame(step);
        };
        this.physRaf = requestAnimationFrame(step);
    }

    private onMouseMove(e: MouseEvent) {
        if (!this.dragging) return;
        this.dragging.vx = e.movementX * 0.6;
        this.dragging.vy = e.movementY * 0.6;
        this.dragging.x = e.clientX - this.dragOX;
        this.dragging.y = e.clientY - this.dragOY;
        this.dragging.el.style.left = this.dragging.x + 'px';
        this.dragging.el.style.top = this.dragging.y + 'px';
    }

    private onMouseUp() {
        if (this.dragging) {
            this.dragging.el.style.cursor = 'grab';
            this.dragging = null;
        }
    }

    private cleanup() {
        cancelAnimationFrame(this.gameRaf);
        cancelAnimationFrame(this.physRaf);
        clearTimeout(this.tildeTimer);
        document.body.classList.remove('sg-phys-body');
    }
}
