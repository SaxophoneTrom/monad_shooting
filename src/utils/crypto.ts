import CryptoJS from 'crypto-js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signData = (data: any): string => {
  const hmacKey = process.env.NEXT_PUBLIC_HMAC_KEY;
  if (!hmacKey) {
    throw new Error('NEXT_PUBLIC_HMAC_KEY is not set');
  }

  // データを正規化
  const normalizedData = JSON.stringify({
    score: data.score,
    fid:data.fid,
    userName:data.userName,
    displayName:data.displayName,
    pfpUrl:data.pfpUrl,
    gameplayData: {
      shotsFired: data.gameplayData.shotsFired,
      enemiesDestroyed: data.gameplayData.enemiesDestroyed,
      powerupsCollected: data.gameplayData.powerupsCollected,
      playDuration: data.gameplayData.playDuration,
      timestamp: data.gameplayData.timestamp
    }
  });

  return CryptoJS.HmacSHA256(normalizedData, hmacKey).toString();
};
