import {
  normalizeEchoHotMemoryForStorage,
  type EchoHotMemory,
} from './diaryService';

function withUpdatedEntries(memory: EchoHotMemory, entries: EchoHotMemory['entries'], now: Date): EchoHotMemory {
  return normalizeEchoHotMemoryForStorage({
    ...memory,
    version: memory.version + 1,
    updatedAt: now.toISOString(),
    entries,
  }, now);
}

export function forgetEchoMemoryEntry(memory: EchoHotMemory, entryId: string, now = new Date()): EchoHotMemory {
  return withUpdatedEntries(memory, memory.entries.filter(entry => entry.id !== entryId), now);
}

export function editEchoMemoryEntryContent(memory: EchoHotMemory, entryId: string, content: string, now = new Date()): EchoHotMemory {
  const trimmed = content.trim();
  return withUpdatedEntries(memory, memory.entries.map(entry => entry.id === entryId
    ? {
        ...entry,
        content: trimmed || entry.content,
        userFeedback: 'accepted',
        lastReinforcedAt: now.toISOString(),
      }
    : entry), now);
}

export function rejectEchoMemoryEntry(memory: EchoHotMemory, entryId: string, now = new Date()): EchoHotMemory {
  return withUpdatedEntries(memory, memory.entries.map(entry => entry.id === entryId
    ? {
        ...entry,
        userFeedback: 'rejected',
        visibility: 'never_echo',
      }
    : entry), now);
}

export function markEchoMemoryEntrySensitive(memory: EchoHotMemory, entryId: string, now = new Date()): EchoHotMemory {
  return withUpdatedEntries(memory, memory.entries.map(entry => entry.id === entryId
    ? {
        ...entry,
        sensitivity: 'high',
        visibility: 'never_echo',
      }
    : entry), now);
}
