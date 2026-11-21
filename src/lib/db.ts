/** Aulas salvas no IndexedDB do aparelho. Nada sai daqui sem o professor exportar. */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Session } from './session'
import type { RoomMeasurement } from './room'

interface Schema extends DBSchema {
  sessions: { key: string; value: Session; indexes: { startedAt: number } }
  rooms: { key: string; value: RoomMeasurement; indexes: { createdAt: number } }
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null

function db() {
  dbp ??= openDB<Schema>('sala-calma', 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        const s = d.createObjectStore('sessions', { keyPath: 'id' })
        s.createIndex('startedAt', 'startedAt')
      }
      if (oldVersion < 2) {
        const r = d.createObjectStore('rooms', { keyPath: 'id' })
        r.createIndex('createdAt', 'createdAt')
      }
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

export async function saveRoom(m: RoomMeasurement) {
  await (await db()).put('rooms', structuredClone(m))
}

export async function listRooms(): Promise<RoomMeasurement[]> {
  return (await (await db()).getAllFromIndex('rooms', 'createdAt')).reverse()
}

export async function deleteRoom(id: string) {
  await (await db()).delete('rooms', id)
}
