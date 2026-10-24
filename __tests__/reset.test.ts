import { beforeEach, describe, expect, it } from 'vitest';

import { addBeaten, loadAvatar, loadBeaten, resetProgress, saveAvatar } from '../src/storage/profile';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  keys() {
    return [...this.m.keys()];
  }
}

let mem: MemStorage;
beforeEach(() => {
  mem = new MemStorage();
  // Object.keys(localStorage) で鍵が列挙できるように、鍵を自身のプロパティとしても見せる
  (globalThis as unknown as { localStorage: unknown }).localStorage = new Proxy(mem, {
    ownKeys: () => mem.keys(),
    getOwnPropertyDescriptor: (_t, k) => (typeof k === 'string' && mem.getItem(k) !== null ? { enumerable: true, configurable: true, value: mem.getItem(k) } : undefined),
  });
});

describe('テスト用: きろくをけす', () => {
  it('記録は消え、設定（音・名前・難易度）は残る', () => {
    for (const k of ['trophies', 'unlocked', 'points', 'deck', 'history', 'daily', 'tutorial', 'sound', 'name', 'level']) mem.setItem(`riale-cardbatlle:${k}`, '1');
    mem.setItem('other-app:x', '1');
    resetProgress();
    for (const k of ['trophies', 'unlocked', 'points', 'deck', 'history', 'daily', 'tutorial']) expect(mem.getItem(`riale-cardbatlle:${k}`)).toBeNull();
    for (const k of ['sound', 'name', 'level']) expect(mem.getItem(`riale-cardbatlle:${k}`)).toBe('1');
    expect(mem.getItem('other-app:x')).toBe('1');
  });
});

describe('アイコン（勝った相手の顔）', () => {
  it('初めて勝った相手だけ true。アイコンは最初は hero、選ぶと保存される', () => {
    (globalThis as unknown as { window: EventTarget }).window = new EventTarget();
    expect(loadAvatar()).toBe('hero');
    expect(addBeaten('毒')).toBe(true);
    expect(addBeaten('毒')).toBe(false);
    expect(loadBeaten().has('毒')).toBe(true);
    saveAvatar('毒');
    expect(loadAvatar()).toBe('毒');
  });
});

