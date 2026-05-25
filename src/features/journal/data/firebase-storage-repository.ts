import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { firebaseStorage, isFirebaseConfigured } from '@/lib/firebase';

const defaultWorkspaceId = (process.env.NEXT_PUBLIC_FIREBASE_WORKSPACE_ID || 'personal-journal').trim() || 'personal-journal';

export type ScreenshotUploadInput = {
  tradeId: string;
  screenshotId: string;
  file: File;
};

export type ScreenshotUploadResult = {
  cloudUrl: string;
  uploadedAt: string;
  storagePath: string;
};

export const firebaseStorageRepository = {
  isConfigured: Boolean(isFirebaseConfigured && firebaseStorage),
  getScreenshotPath(tradeId: string, screenshotId: string, fileName: string) {
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `workspaces/${defaultWorkspaceId}/trades/${tradeId}/screenshots/${screenshotId}/${safeFileName}`;
  },
  async uploadScreenshot({ tradeId, screenshotId, file }: ScreenshotUploadInput): Promise<ScreenshotUploadResult | null> {
    if (!firebaseStorage) {
      return null;
    }

    const storagePath = this.getScreenshotPath(tradeId, screenshotId, file.name);
    const storageRef = ref(firebaseStorage, storagePath);
    await uploadBytes(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        tradeId,
        screenshotId,
      },
    });

    return {
      cloudUrl: await getDownloadURL(storageRef),
      uploadedAt: new Date().toISOString(),
      storagePath,
    };
  },
};
