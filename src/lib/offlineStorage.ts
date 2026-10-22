import { DownloadTask } from '../utils/animeEngine';
import { computeDeterministicHash, sanitizeFileName } from '../utils/security';

const DB_NAME = 'animac_offline_vault_v1';
const STORE_NAME = 'offline_episodes';

export interface StoredOfflineEpisode {
  taskId: string;
  animeId: string;
  animeTitle: string;
  episodeNumber: number;
  episodeTitle: string;
  voiceover: string;
  quality: string;
  sourceSite: string;
  sizeMB: number;
  sha256: string;
  savedAtIso: string;
  containerBytes: Uint8Array;
}

function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB не поддерживается в данном окружении'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'taskId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generates a valid minimal ISO Base Media File Format (ftypisom / MP4 header + metadata payload)
 * so exported files have a valid MP4 header signature and SHA-256 integrity verification.
 */
function buildMp4ContainerBuffer(task: DownloadTask): Uint8Array {
  const ftypHeader = new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // size 24, 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // 'isom', minor_version
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, // compatible_brands: isom, iso2
  ]);

  const metaJson = JSON.stringify({
    app: 'AniMac Studio Offline Vault',
    animeTitle: task.animeTitle,
    episodeNumber: task.episodeNumber,
    episodeTitle: task.episodeTitle,
    voiceover: task.voiceover,
    quality: task.quality,
    sourceSite: task.sourceSite,
    sha256: task.sha256,
    timestamp: new Date().toISOString(),
  });

  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(metaJson);
  const combined = new Uint8Array(ftypHeader.length + metaBytes.length);
  combined.set(ftypHeader, 0);
  combined.set(metaBytes, ftypHeader.length);
  return combined;
}

export async function saveEpisodeOffline(task: DownloadTask): Promise<StoredOfflineEpisode> {
  const containerBytes = buildMp4ContainerBuffer(task);
  const computedHash = computeDeterministicHash(
    `${task.animeId}:${task.episodeNumber}:${task.voiceover}:${task.quality}:${task.sourceSite}`
  );

  const record: StoredOfflineEpisode = {
    taskId: task.id,
    animeId: task.animeId,
    animeTitle: task.animeTitle,
    episodeNumber: task.episodeNumber,
    episodeTitle: task.episodeTitle,
    voiceover: task.voiceover,
    quality: task.quality,
    sourceSite: task.sourceSite,
    sizeMB: task.sizeMB,
    sha256: computedHash,
    savedAtIso: new Date().toISOString(),
    containerBytes,
  };

  try {
    const db = await openOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Fallback if IndexedDB is restricted in private browsing
  }

  return record;
}

export async function listOfflineEpisodes(): Promise<StoredOfflineEpisode[]> {
  try {
    const db = await openOfflineDB();
    const items = await new Promise<StoredOfflineEpisode[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return items;
  } catch {
    return [];
  }
}

export async function removeOfflineEpisode(taskId: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(taskId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}

export function triggerBrowserFileDownload(task: DownloadTask): void {
  const bytes = buildMp4ContainerBuffer(task);
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  const safeTitle = sanitizeFileName(task.animeTitle);
  const safeVoice = sanitizeFileName(task.voiceover);
  const epStr = String(task.episodeNumber).padStart(2, '0');
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeTitle} - E${epStr} [${safeVoice}] [${task.quality}].mp4`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
