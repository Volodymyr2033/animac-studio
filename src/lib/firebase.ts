import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { PlatformTarget, SourceSite, VideoQuality } from '../utils/security';
import { DownloadTask, WatchHistoryItem } from '../utils/animeEngine';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export async function signInWithGoogleAccount(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutAccount(): Promise<void> {
  await firebaseSignOut(auth);
}

export { onAuthStateChanged, type User };

function sanitizeId(raw: string, maxLen = 80): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, maxLen) || 'item-1';
}

export async function ensureUserProfileInCloud(params: {
  user: User;
  preferredPlatform: PlatformTarget;
  preferredQuality: VideoQuality;
  preferredVoiceover: string;
  theme: 'dark' | 'light';
}): Promise<void> {
  if (!params.user.emailVerified) return;
  const userPath = `users/${params.user.uid}`;
  const userRef = doc(db, 'users', params.user.uid);
  const payload = {
    ownerId: params.user.uid.slice(0, 128),
    displayName: (params.user.displayName || params.user.email || 'Пользователь AniMac').slice(0, 100),
    preferredPlatform: params.preferredPlatform,
    preferredQuality: params.preferredQuality,
    preferredVoiceover: params.preferredVoiceover.slice(0, 60),
    theme: params.theme,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(userRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function syncWatchHistoryItemToCloud(
  user: User,
  item: WatchHistoryItem
): Promise<void> {
  if (!user.emailVerified) return;
  const docId = sanitizeId(item.id, 120);
  const path = `users/${user.uid}/watchHistory/${docId}`;
  const ref = doc(db, 'users', user.uid, 'watchHistory', docId);

  const payload = {
    ownerId: user.uid.slice(0, 128),
    animeId: sanitizeId(item.animeId, 80),
    animeTitle: item.animeTitle.slice(0, 160),
    episodeNumber: Math.max(1, Math.min(5000, Math.floor(item.episodeNumber))),
    episodeTitle: item.episodeTitle.slice(0, 160),
    voiceover: item.voiceover.slice(0, 60),
    quality: item.quality,
    sourceSite: item.sourceSite as SourceSite,
    progressSeconds: Math.max(0, Math.min(86400, Math.floor(item.progressSeconds))),
    durationSeconds: Math.max(1, Math.min(86400, Math.floor(item.durationSeconds))),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeWatchHistoryFromCloud(user: User, historyId: string): Promise<void> {
  if (!user.emailVerified) return;
  const docId = sanitizeId(historyId, 120);
  const path = `users/${user.uid}/watchHistory/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'watchHistory', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncDownloadTaskToCloud(user: User, task: DownloadTask): Promise<void> {
  if (!user.emailVerified) return;
  const docId = sanitizeId(task.id, 120);
  const path = `users/${user.uid}/downloadQueue/${docId}`;
  const ref = doc(db, 'users', user.uid, 'downloadQueue', docId);

  const payload = {
    ownerId: user.uid.slice(0, 128),
    animeId: sanitizeId(task.animeId, 80),
    animeTitle: task.animeTitle.slice(0, 160),
    episodeNumber: Math.max(1, Math.min(5000, Math.floor(task.episodeNumber))),
    episodeTitle: task.episodeTitle.slice(0, 160),
    voiceover: task.voiceover.slice(0, 60),
    quality: task.quality,
    sourceSite: task.sourceSite as SourceSite,
    status: task.status,
    progressPercent: Math.max(0, Math.min(100, Math.round(task.progressPercent))),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeDownloadTaskFromCloud(user: User, taskId: string): Promise<void> {
  if (!user.emailVerified) return;
  const docId = sanitizeId(taskId, 120);
  const path = `users/${user.uid}/downloadQueue/${docId}`;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'downloadQueue', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToCloudSync(
  user: User,
  callbacks: {
    onWatchHistory: (items: Partial<WatchHistoryItem>[]) => void;
    onDownloadQueue: (items: Partial<DownloadTask>[]) => void;
    onProfile: (profile: {
      preferredPlatform?: PlatformTarget;
      preferredQuality?: VideoQuality;
      preferredVoiceover?: string;
      theme?: 'dark' | 'light';
    }) => void;
  }
): () => void {
  const userPath = `users/${user.uid}`;
  const historyPath = `users/${user.uid}/watchHistory`;
  const queuePath = `users/${user.uid}/downloadQueue`;

  getDoc(doc(db, 'users', user.uid))
    .then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callbacks.onProfile({
          preferredPlatform: data.preferredPlatform,
          preferredQuality: data.preferredQuality,
          preferredVoiceover: data.preferredVoiceover,
          theme: data.theme,
        });
      }
    })
    .catch((err) => handleFirestoreError(err, OperationType.GET, userPath));

  const historyQuery = query(
    collection(db, 'users', user.uid, 'watchHistory'),
    where('ownerId', '==', user.uid)
  );
  const unsubHistory = onSnapshot(
    historyQuery,
    (snapshot) => {
      const items: Partial<WatchHistoryItem>[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          animeId: data.animeId,
          animeTitle: data.animeTitle,
          episodeNumber: data.episodeNumber,
          episodeTitle: data.episodeTitle,
          voiceover: data.voiceover,
          quality: data.quality,
          sourceSite: data.sourceSite,
          progressSeconds: data.progressSeconds,
          durationSeconds: data.durationSeconds,
        };
      });
      callbacks.onWatchHistory(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, historyPath)
  );

  const queueQuery = query(
    collection(db, 'users', user.uid, 'downloadQueue'),
    where('ownerId', '==', user.uid)
  );
  const unsubQueue = onSnapshot(
    queueQuery,
    (snapshot) => {
      const items: Partial<DownloadTask>[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          animeId: data.animeId,
          animeTitle: data.animeTitle,
          episodeNumber: data.episodeNumber,
          episodeTitle: data.episodeTitle,
          voiceover: data.voiceover,
          quality: data.quality,
          sourceSite: data.sourceSite,
          status: data.status,
          progressPercent: data.progressPercent,
        };
      });
      callbacks.onDownloadQueue(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, queuePath)
  );

  return () => {
    unsubHistory();
    unsubQueue();
  };
}
