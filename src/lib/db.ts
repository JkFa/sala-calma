/** Aulas salvas no IndexedDB do aparelho. Nada sai daqui sem o professor exportar. */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Session } from './session'

interface Schema extends DBSchema {
  sessions: { key: string; value: Session; indexes: { startedAt: number } }
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null

function db() {
  dbp ??= openDB<Schema>('sala-calma', 1, {
    upgrade(d) {
      const s = d.createObjectStore('sessions', { keyPath: 'id' })
      s.createIndex('startedAt', 'startedAt')
    },
  })
  return dbp
}

export async function saveSession(s: Session) {
  // structuredClone garante que só dados simples vão para o banco.
  await (await db()).put('sessions', structuredClone(s))
}

export async function getSession(id: string) {
  return (await db()).get('sessions', id)
}

export async function listSessions(): Promise<Session[]> {
  const all = await (await db()).getAllFromIndex('sessions', 'startedAt')
  return all.reverse()
}

export async function deleteSession(id: string) {
  await (await db()).delete('sessions', id)
}

export async function unfinishedSession(): Promise<Session | undefined> {
  const all = await listSessions()
  return all.find((s) => s.endedAt === null)
}
