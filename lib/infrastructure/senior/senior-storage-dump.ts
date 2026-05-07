/**
 * Helper de debug — dumpa as chaves de localStorage e sessionStorage de uma
 * aba aberta em platform.senior.com.br.
 *
 * Objetivo: descobrir em qual chave o Senior X armazena o `refresh_token` (o
 * webRequest captura só o `access_token` do header Authorization, e
 * `chrome.cookies` não enxerga `com.senior.token` por ser HttpOnly+CHIPS).
 * Conhecendo a chave, conseguimos plugar a leitura no fluxo principal e
 * destravar `refreshSeniorTokenSilently`.
 *
 * Estratégia:
 *   - Lista TODAS as chaves de cada storage.
 *   - Inclui preview (primeiros ~400 chars) só de chaves que parecem auth
 *     (`token`, `auth`, `session`, `refresh`, `keycloak`) — evita derramar
 *     dados sensíveis irrelevantes no log.
 *
 * Tudo read-only. Zero side-effect.
 */
import { debugLog, debugWarn } from '../../domain/debug';

// Inclui também o padrão Senior X de armazenar token por chave: a chave é o
// próprio access_token (~32 chars opaque) + sufixo do módulo (`-HCM` etc).
// Confirmado no dump: chave `ar1nlKcp...XXX-HCM` aparece com o mesmo
// prefixo do Bearer capturado via webRequest.
const AUTH_PATTERNS = /token|auth|session|refresh|keycloak|jwt|^[A-Za-z0-9]{24,}-[A-Z]{2,}$|SENIOR_/i;
const PREVIEW_MAX_CHARS = 400;

export interface StorageEntry {
  key: string;
  length: number;
  preview?: string;
}

export interface IdbItem {
  key: string;
  valueLength: number;
  preview?: string;
}

export interface IdbStore {
  name: string;
  count: number;
  items: IdbItem[];
}

export interface IdbDatabase {
  name: string;
  version?: number;
  stores: IdbStore[];
}

export interface SeniorStorageDump {
  ok: boolean;
  tabId?: number;
  url?: string;
  origin?: string;
  localStorage?: StorageEntry[];
  sessionStorage?: StorageEntry[];
  indexedDB?: IdbDatabase[];
  errorMessage?: string;
}

async function findSeniorTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: 'https://platform.senior.com.br/*' });
  return tabs[0] ?? null;
}

export async function dumpSeniorTabStorage(): Promise<SeniorStorageDump> {
  const tab = await findSeniorTab();
  if (!tab?.id) {
    return {
      ok: false,
      errorMessage: 'Nenhuma aba aberta em platform.senior.com.br. Abra a Senior 1× e tente de novo.',
    };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: [AUTH_PATTERNS.source, AUTH_PATTERNS.flags, PREVIEW_MAX_CHARS],
      func: async (patternSrc: string, patternFlags: string, maxChars: number) => {
        const re = new RegExp(patternSrc, patternFlags);
        type StorageEntry = { key: string; length: number; preview?: string };
        type IdbItem = { key: string; valueLength: number; preview?: string };
        type IdbStore = { name: string; count: number; items: IdbItem[] };
        type IdbDatabase = { name: string; version?: number; stores: IdbStore[] };

        function previewIfMatch(key: string, val: string): string | undefined {
          if (re.test(key) || re.test(val.slice(0, 200))) {
            return val.length > maxChars ? val.slice(0, maxChars) + '…' : val;
          }
          return undefined;
        }

        function dumpStore(s: Storage): StorageEntry[] {
          const out: StorageEntry[] = [];
          for (let i = 0; i < s.length; i++) {
            const key = s.key(i);
            if (!key) continue;
            const val = s.getItem(key) ?? '';
            out.push({ key, length: val.length, preview: previewIfMatch(key, val) });
          }
          return out;
        }

        async function dumpIdb(): Promise<IdbDatabase[]> {
          if (typeof indexedDB.databases !== 'function') return [];
          const dbInfos = await indexedDB.databases();
          const result: IdbDatabase[] = [];

          for (const info of dbInfos) {
            if (!info.name) continue;
            const stores: IdbStore[] = [];
            try {
              const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const req = indexedDB.open(info.name as string);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
                req.onblocked = () => reject(new Error('blocked'));
              });

              for (const storeName of Array.from(db.objectStoreNames)) {
                try {
                  const tx = db.transaction(storeName, 'readonly');
                  const store = tx.objectStore(storeName);
                  const items: IdbItem[] = [];

                  await new Promise<void>((resolve, reject) => {
                    const cursorReq = store.openCursor();
                    cursorReq.onerror = () => reject(cursorReq.error);
                    cursorReq.onsuccess = () => {
                      const cursor = cursorReq.result;
                      if (!cursor) { resolve(); return; }
                      const keyStr = String(cursor.key);
                      let valStr: string;
                      try { valStr = JSON.stringify(cursor.value); }
                      catch { valStr = '[unserializable]'; }
                      items.push({
                        key: keyStr,
                        valueLength: valStr.length,
                        preview: previewIfMatch(keyStr, valStr),
                      });
                      cursor.continue();
                    };
                  });

                  stores.push({ name: storeName, count: items.length, items });
                } catch (e) {
                  stores.push({ name: storeName, count: -1, items: [{
                    key: '__error__',
                    valueLength: 0,
                    preview: (e as Error).message,
                  }] });
                }
              }
              db.close();
            } catch (e) {
              stores.push({ name: '__db_error__', count: -1, items: [{
                key: '__error__',
                valueLength: 0,
                preview: (e as Error).message,
              }] });
            }
            result.push({ name: info.name, version: info.version, stores });
          }
          return result;
        }

        const idb = await dumpIdb();

        return {
          url: location.href,
          origin: location.origin,
          localStorage: dumpStore(localStorage),
          sessionStorage: dumpStore(sessionStorage),
          indexedDB: idb,
        };
      },
    });

    const result = results?.[0]?.result;
    if (!result) {
      return { ok: false, tabId: tab.id, errorMessage: 'executeScript retornou vazio' };
    }
    debugLog('[POC] Senior storage dump OK', JSON.stringify({
      tabId: tab.id,
      url: result.url,
      lsKeys: result.localStorage.length,
      ssKeys: result.sessionStorage.length,
      idbDbs: result.indexedDB.length,
    }));
    return {
      ok: true,
      tabId: tab.id,
      url: result.url,
      origin: result.origin,
      localStorage: result.localStorage,
      sessionStorage: result.sessionStorage,
      indexedDB: result.indexedDB,
    };
  } catch (e) {
    const err = e as Error;
    debugWarn('Senior storage dump erro:', err.message);
    return {
      ok: false,
      tabId: tab.id,
      errorMessage: `${err.name}: ${err.message}`,
    };
  }
}
