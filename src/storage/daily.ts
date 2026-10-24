// デイリーミッション。日付ごとに 3 つ選ばれ（その日のうちは同じ）、対戦の結果で進む。
// 達成すると宝箱ゲージが 1 点たまる。煽らないよう、取り逃しの罰も期限の強調もしない。localStorage に入れる。

const KEY = 'riale-cardbatlle:daily';

export type MissionId = 'win1' | 'win3' | 'play3' | 'summon15' | 'interrupt2' | 'spell3' | 'face30';

export const MISSIONS: Record<MissionId, { text: string; goal: number }> = {
  win1: { text: '1 回勝つ', goal: 1 },
  win3: { text: '3 回勝つ', goal: 3 },
  play3: { text: '3 回対戦する', goal: 3 },
  summon15: { text: 'カードを 15 枚出す', goal: 15 },
  interrupt2: { text: '割り込みを 2 回成功させる', goal: 2 },
  spell3: { text: '呪文を 3 回使う', goal: 3 },
  face30: { text: '相手プレイヤーに合計 30 ダメージ', goal: 30 },
};

const IDS = Object.keys(MISSIONS) as MissionId[];

/** 1 試合ぶんの記録。 */
export interface MatchStats {
  won: boolean;
  summons: number;
  interrupts: number;
  spells: number;
  faceDamage: number;
}

function gainOf(id: MissionId, s: MatchStats): number {
  switch (id) {
    case 'win1':
    case 'win3':
      return s.won ? 1 : 0;
    case 'play3':
      return 1;
    case 'summon15':
      return s.summons;
    case 'interrupt2':
      return s.interrupts;
    case 'spell3':
      return s.spells;
    case 'face30':
      return s.faceDamage;
  }
}

export function dateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** その日のミッション 3 つ（日付から決まる）。「勝つ」系は 1 つまで。 */
export function missionsFor(day: string): MissionId[] {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out: MissionId[] = [];
  let i = h;
  while (out.length < 3) {
    const id = IDS[i % IDS.length]!;
    const winKind = id === 'win1' || id === 'win3';
    if (!out.includes(id) && !(winKind && out.some((x) => x === 'win1' || x === 'win3'))) out.push(id);
    i = (Math.imul(i, 1103515245) + 12345) >>> 0;
  }
  return out;
}

export interface DailyState {
  day: string;
  missions: MissionId[];
  progress: Partial<Record<MissionId, number>>;
}

export function loadDaily(day = dateKey()): DailyState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<DailyState>;
      if (v.day === day && Array.isArray(v.missions) && v.progress && typeof v.progress === 'object') return v as DailyState;
    }
  } catch {
    // 読めなければ今日の分を新しく
  }
  return { day, missions: missionsFor(day), progress: {} };
}

/** 試合の記録を足し、この試合で新しく達成したミッションを返す。 */
export function recordDaily(stats: MatchStats, day = dateKey()): MissionId[] {
  const st = loadDaily(day);
  const done: MissionId[] = [];
  for (const id of st.missions) {
    const before = st.progress[id] ?? 0;
    const goal = MISSIONS[id].goal;
    const after = Math.min(goal, before + gainOf(id, stats));
    st.progress[id] = after;
    if (before < goal && after >= goal) done.push(id);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
  } catch {
    // 保存できなくても遊べる
  }
  return done;
}
