import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'VoiceIDOffline';
const DB_VERSION = 1;

export interface CachedMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content_type: string;
  content_body?: string | null;
  created_at: string;
  [key: string]: any;
}

export interface OutboxMessage extends CachedMessage {
  queued_at: number;
}

interface OfflineDB {
  messages: {
    key: string;
    value: CachedMessage;
    indexes: { conversation_id: string; created_at: string };
  };
  outbox: {
    key: string;
    value: OutboxMessage;
    indexes: { conversation_id: string; queued_at: number };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('messages')) {
          const store = db.createObjectStore('messages');
          store.createIndex('conversation_id', 'conversation_id');
          store.createIndex('created_at', 'created_at');
        }
        if (!db.objectStoreNames.contains('outbox')) {
          const store = db.createObjectStore('outbox');
          store.createIndex('conversation_id', 'conversation_id');
          store.createIndex('queued_at', 'queued_at');
        }
      },
    });
  }
  return dbPromise;
}

const keyFor = (conversationId: string, messageId: string) => `${conversationId}:${messageId}`;

export const OfflineMessageStore = {
  async cacheConversation(conversationId: string, messages: CachedMessage[]) {
    const db = await getDB();
    const tx = db.transaction('messages', 'readwrite');
    for (const message of messages) {
      await tx.store.put(message, keyFor(conversationId, message.id));
    }
    await tx.done;
  },

  async upsertMessage(message: CachedMessage) {
    const db = await getDB();
    await db.put('messages', message, keyFor(message.conversation_id, message.id));
  },

  async deleteMessage(conversationId: string, messageId: string) {
    const db = await getDB();
    await db.delete('messages', keyFor(conversationId, messageId));
  },

  async getConversation(conversationId: string) {
    const db = await getDB();
    const values = await db.getAllFromIndex('messages', 'conversation_id', conversationId);
    return values.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  },

  async queueMessage(message: OutboxMessage) {
    const db = await getDB();
    await db.put('outbox', message, message.id);
    await db.put('messages', message, keyFor(message.conversation_id, message.id));
  },

  async getOutbox(conversationId?: string) {
    const db = await getDB();
    if (conversationId) {
      const values = await db.getAllFromIndex('outbox', 'conversation_id', conversationId);
      return values.sort((a, b) => a.queued_at - b.queued_at);
    }
    const values = await db.getAll('outbox');
    return values.sort((a, b) => a.queued_at - b.queued_at);
  },

  async removeOutbox(messageId: string) {
    const db = await getDB();
    await db.delete('outbox', messageId);
  },
};
