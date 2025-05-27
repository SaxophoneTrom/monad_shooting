import React, { useState, useEffect, useRef, useCallback } from 'react';
import sdk, {
  SignIn as SignInCore,
} from "@farcaster/frame-sdk";
import { signData } from '~/utils/crypto';
import RankingBoard, { RankingData } from './RankingBoard';
import { useFrame } from "~/components/providers/FrameProvider";
import {
  useAccount,
  useSendTransaction,
  useSignMessage,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useDisconnect,
  useConnect,
  useSwitchChain,
  useChainId,
  useWalletClient,
  usePublicClient,
  useWriteContract
} from "wagmi";
import { getAccount } from 'wagmi/actions'; // ★ getAccount をインポート
import { monadTestnet } from "wagmi/chains";
import { config } from "~/components/providers/WagmiProvider";
import { parseEther } from 'viem/utils';
import web3gameAbi from '~/contracts/web3game_abi.json';
import awardNFTAbi from '~/contracts/awardNFT_abi.json';

// 共通
const GAME_WIDTH = 360;
const GAME_HEIGHT = 520;
const PLAYER_Y = GAME_HEIGHT - 120;

const BOSS_COMMING_POINT = 5000;
const BOSS_BONUS_SCORE = 30000;

const ENEMY_SHOOT_LIMIT_Y = GAME_HEIGHT * 0.6; // 画面の60%の位置

const IS_DEBUG = false;

// NFTミント用の設定
const NFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS || '0x9e36adb4ac80d83b65a543c5d662532238b0b23f';

const PLAY_AMOUNT =  process.env.NEXT_PUBLIC_PLAY_AMOUNT || 0.05;

// 型定義
interface Enemy {
  x: number;
  y: number;
  id: number;
  lastShot: number;
  type: 'normal' | 'shooter' | 'fast';
  speed: number;
}

// ボスの状態を定義
type BossState = 'appearing' | 'fighting' | 'dying';
// ボスの型定義
interface Boss {
  x: number;
  y: number;
  id: number;
  hp: number;
  maxHp: number;
  phase: number;
  lastShot: number;
  shotCount: number;
  setCount: number;
  state: BossState;     // ボスの状態を追加
  appearProgress: number; // 登場演出の進行度（0-1）
}

interface BaseBullet {
  id: number;
  x: number;
  y: number;
}

interface PlayerBullet extends BaseBullet {
  type: 'player';
  vx: number;
  vy: number;
}

interface EnemyBullet extends BaseBullet {
  type: 'enemy';
  vx: number;
  vy: number;
}

interface PowerUp {
  x: number;
  y: number;
  id: number;
  type: 'multiShot';
  speed: number;
}

interface Explosion {
  x: number;
  y: number;
  id: number;
  size: number;
  duration: number;
  startTime: number;
}

interface GameState {
  playerPosition: number;
  playerBullets: PlayerBullet[];
  enemyBullets: EnemyBullet[];
  enemies: Enemy[];
  powerUps: PowerUp[];
  explosions: Explosion[];
  shotLevel: number;
  score: number;
  lastRender: number;
  lastEnemySpawn: number;
  stars: Star[];  // 星の配列を追加
  lastShot: number;    // 最後に射撃した時間を追加
  isFirePressed: boolean;  // 射撃ボタンが押されているかを追加
  boss: Boss | null;
  isBossPhase: boolean;
  lastBossScore: number;  // 最後にボスが出現したスコア
  bossClearCount:number; // ボスの撃破数
}

interface GameplayData {
  shotsFired: number;
  enemiesDestroyed: number;
  powerupsCollected: number;
  startTime: number;
}

// 弾のパターン定義
const BULLET_PATTERNS = {
  STRAIGHT: 'straight',
  AIMED: 'aimed',
  SPREAD_2: 'spread2',
  SPREAD_3: 'spread3',
  CIRCLE: 'circle'
} as const;

// ボスの攻撃パターンを定義
const BOSS_ATTACK_PATTERNS = {
  AIMED_BURST: {
    shots: 20,    // 1セットの弾数
    sets: 3,      // セット数
    interval: 50, // 弾の発射間隔(ms)
    setInterval: 1000, // セット間のインターバル(ms)
  },
  SPREAD_SHOT: {
    shots: 4,     // 一度に発射する弾数
    sets: 3,      // セット数
    interval: 650,
    setInterval: 1000,
  },
  CIRCLE_SHOT: {
    shots: 16,    // 円形に発射する弾数
    sets: 2,      // セット数
    interval: 300,
    setInterval: 2000,
  }
} as const;

// ボス生成関数
const createBoss = (): Boss => ({
  x: GAME_WIDTH / 2,
  y: -50, // 画面外から開始
  id: Date.now(),
  hp: 1000,
  maxHp: 1000,
  phase: 0,
  lastShot: 0,
  shotCount: 0,
  setCount: 0,
  state: 'appearing',
  appearProgress: 0
});


// 星の型定義
interface Star {
    x: number;
    y: number;
    size: number;
    speed: number;
    brightness: number;  // 星の明るさ（0-1）
  }

type BulletPattern = typeof BULLET_PATTERNS[keyof typeof BULLET_PATTERNS];



// 画像の読み込み処理を追加
const useGameImages = () => {
  const [images, setImages] = useState<{
    player: HTMLImageElement | null;
    enemy: HTMLImageElement | null;
    shooter: HTMLImageElement | null;
    fast: HTMLImageElement | null;
    powerup: HTMLImageElement | null;
    boss: HTMLImageElement | null;  // ボス画像を追加
  }>({
    player: null,
    enemy: null,
    shooter: null,
    fast: null,
    powerup: null,
    boss: null,
  });

  useEffect(() => {
    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = reject;
      });
    };

    Promise.all([
      loadImage('/images/player.png'),
      loadImage('/images/enemy.png'),
      loadImage('/images/shooter.png'),
      loadImage('/images/fast.png'),
      loadImage('/images/powerup.png'),
      loadImage('/images/boss.png')    // ボス画像のロード
    ]).then(([player, enemy, shooter, fast, powerup, boss]) => {
      setImages({
        player,
        enemy,
        shooter,
        fast,
        powerup,
        boss
      });
    }).catch(error => {
      console.error('Failed to load game images:', error);
    });
  }, []);

  return images;
};

function setFid(fid: number) {
  return fid;
}

const ShootingGame: React.FC = () => {
  const {isSDKLoaded, context, added, notificationDetails, lastEvent, addFrame, addFrameResult, openUrl, close } = useFrame();
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [fid, setFid] = useState(0);
  
  const {
    sendTransaction,
    error: sendTxError,
    isError: isSendTxError,
    isPending: isSendTxPending,
  } = useSendTransaction();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

  const { connect, connectors, isPending: isConnectPending } = useConnect();

  const {
    switchChain,
    error: switchChainError,
    isError: isSwitchChainError,
    isPending: isSwitchChainPending,
  } = useSwitchChain();

  const [isPaymentConfirmed, setIsPaymentConfirmed] = useState(false);
  const { data: hash, writeContractAsync } = useWriteContract() // ★ writeContract を writeContractAsync に変更

  // NFTミント関連のステート
  const [isMintingNFT, setIsMintingNFT] = useState(false);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);
  const [mintSuccess, setMintSuccess] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintSignature, setMintSignature] = useState<{
    signature: string;
    parameters: {
      score: number;
      nonce: number;
      expiry: number;
    };
  } | null>(null);
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false); // 新しいステート
  const [paymentError, setPaymentError] = useState<string | null>(null); // ★ エラーメッセージ用state
  const [isConnectingAndSwitching, setIsConnectingAndSwitching] = useState(false); // 新しいstate: 接続・スイッチ処理中フラグ

  const handleConnectAndSwitchChain = useCallback(async () => {
    setIsConnectingAndSwitching(true);
    setPaymentError(null);
    let connectedSuccessfully = isConnected;

    if (!connectedSuccessfully) {
      const userAgent = navigator.userAgent;
      const isWarpcast = userAgent.includes("Warpcast");
      try {
        if (isWarpcast) {
          await connect({ connector: connectors[0] });
        } else {
          if (connectors.length > 2 && connectors[2]) { // MetaMask
            await connect({ connector: connectors[2] });
          } else if (connectors.length > 1 && connectors[1]) { // Coinbase Wallet
            await connect({ connector: connectors[1] });
          } else if (connectors.length > 0 && connectors[0]) { // Fallback
            await connect({ connector: connectors[0] });
          } else {
            throw new Error("No suitable wallet connector found.");
          }
        }
        connectedSuccessfully = getAccount(config).isConnected;
        if (!connectedSuccessfully) {
          setPaymentError("Wallet connection failed. Please try again.");
          setIsConnectingAndSwitching(false);
          return false;
        }
      } catch (error) {
        console.error("Wallet connection error:", error);
        setPaymentError(error instanceof Error ? error.message : "Failed to connect wallet.");
        setIsConnectingAndSwitching(false);
        return false;
      }
    }

    const currentChainId = getAccount(config).chainId;
    if (currentChainId !== monadTestnet.id) {
      try {
        await switchChain({ chainId: monadTestnet.id });
        // 少し待機してから再度チェーンIDを確認
        await new Promise(resolve => setTimeout(resolve, 2500)); // 2.5秒待機

        if (getAccount(config).chainId !== monadTestnet.id) {
          setPaymentError('Failed to switch to Monad Testnet. Please check your wallet and try again.');
          setIsConnectingAndSwitching(false);
          return false;
        }
      } catch (error) {
        console.error('Chain switch failed:', error);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errMsg = (error && typeof (error as any).shortMessage === 'string' ? (error as any).shortMessage : null) || (error instanceof Error ? error.message : String(error)) || "Failed to switch network.";
        setPaymentError(`Network switch error: ${errMsg}`);
        setIsConnectingAndSwitching(false);
        return false;
      }
    }
    setPaymentError(null);
    setIsConnectingAndSwitching(false);
    return true;
  }, [isConnected, connect, connectors, switchChain, setPaymentError]);

  const handleSendEth = useCallback(async () => {
    setPaymentError(null);

    if (!isConnected) {
      setPaymentError("Please connect your wallet first.");
      return;
    }
    if (chainId !== monadTestnet.id) {
      setPaymentError("Please switch to the Monad Testnet first.");
      return;
    }

    setIsInitiatingPayment(true);
    let fidToUse = 0;
    if (isSDKLoaded && context?.user?.fid) {
      fidToUse = context.user.fid;
    } else {
      console.warn('FID is not available, using default 0.');
    }
    
    try{
      const paymentTxHash = await writeContractAsync({
        address: '0x590dDd056fa14AC70bBc4b3e24dD109321D21688',
        abi: web3gameAbi,
        functionName: 'play',
        args: [BigInt(fidToUse)],
        value: parseEther(PLAY_AMOUNT.toString())
      });
      setTxHash(paymentTxHash);
    } catch (e: unknown) {
      const error = e as Error;
      console.error('Error requesting play transaction:', error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let friendlyMessage = (error && typeof (error as any).shortMessage === 'string' ? (error as any).shortMessage : null) || (error.message ? error.message : String(error)) || "An unknown error occurred.";
      if (error.message?.includes("Value sent for a play within an active session")) friendlyMessage = "Error: Payment sent when plays are remaining in session.";
      else if (error.message?.includes("Value sent for a free play session")) friendlyMessage = "Error: Payment sent for a free session.";
      else if (error.message?.includes("Incorrect play price for new session")) friendlyMessage = "Error: Incorrect payment amount for a new session.";
      else if (error.message?.includes("insufficient funds")) friendlyMessage = "Error: Insufficient funds for transaction.";
      setPaymentError(friendlyMessage);
    } finally {
      setIsInitiatingPayment(false);
    }
  }, [isConnected, chainId, isSDKLoaded, context, writeContractAsync, setTxHash, setPaymentError, setIsInitiatingPayment]);


  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover' | 'ranking'>('start');

  const [score, setScore] = useState(0);
  const animationFrameRef = useRef<number | null>(null);

  const [rankings, setRankings] = useState<RankingData[]>([]);
  const [isLoadingRankings, setIsLoadingRankings] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);

  // プレイ限度回数
  const [playCount, setPlayCount] = useState<number>(0);
  const [playLimit, setPlayLimit] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 許可フラグを追加
  const [playPermission, setPlayPermission] = useState(false);

  // SDKロード完了後にプレイ制限を取得
  useEffect(() => {
    const fetchPlayLimit = async () => {
      if (!(!isSDKLoaded || !context?.user.fid)){
        try {
          const response = await fetch(`/api/limitCount?fid=${context.user.fid}`);
          const data = await response.json();
          if (data.success) {
            setPlayLimit(data.limit);
            setPlayCount(data.currentCount || 0);
          }
        } catch (error) {
          console.error('Failed to fetch play limit:', error);
        } finally {
          setIsLoading(false);
        }  
      }else{
        console.log("NoFarcaster");
        setPlayLimit(0);
        setPlayCount(0);
        setIsLoading(false);
      }
    };

    fetchPlayLimit();
  }, [isSDKLoaded, context]);

  // ランキングデータを取得する関数
  const fetchRankings = async () => {
    setIsLoadingRankings(true);
    try {
      const response = await fetch('/api/scores');
      const data = await response.json();
      if (data.success) {
        setRankings(data.scores);
      }
    } catch (error) {
      console.error('Failed to fetch rankings:', error);
    } finally {
      setIsLoadingRankings(false);
    }
  };


  const gameAreaRef = useRef<HTMLCanvasElement | null>(null);
  const images = useGameImages();

    // 初期の星を生成（50個程度）
    const initialStars: Star[] = Array.from({ length: 25 }, () => ({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        size: Math.random() * 0.8 + 0.2,    // 0.2-1.0のサイズに変更（より小さく）
        speed: Math.random() * 1.5 + 0.5,   // 0.5-2.0の速度（やや遅めに）
        brightness: Math.random() * 0.3 + 0.1  // 0.1-0.4の明るさ（より暗く）
    }));

    const gameplayDataRef = useRef<GameplayData>({
      shotsFired: 0,
      enemiesDestroyed: 0,
      powerupsCollected: 0,
      startTime: 0
    });

  const gameStateRef = useRef<GameState>({
    playerPosition: 160,
    playerBullets: [],
    enemyBullets: [],
    enemies: [],
    powerUps: [],
    explosions: [],
    shotLevel: 1,
    score: 0,
    lastRender: 0,
    lastEnemySpawn: 0,
    stars:initialStars,
    // 既存のプロパティ...
    lastShot: 0,
    isFirePressed: false,
    boss: null,
    isBossPhase:false,
    lastBossScore:0,
    bossClearCount:0,
  });

  const touchStateRef = useRef<{
    touchStartX: number | null;
    initialPlayerPos: number | null;
  }>({
    touchStartX: null,
    initialPlayerPos: null
  });

  const isMobile = typeof window !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);


  const submitScore = async () => {
    if (scoreSubmitted) return; // 既に送信済みの場合は何もしない

    try {
      let fid = 0;
      let user_name = '';
      let diplay_name = '';
      let pfp_url = '';
      if(context){
        fid = context.user.fid;
        user_name = context.user.username ?? '';
        diplay_name = context.user.displayName ?? '';
        pfp_url = context.user.pfpUrl ?? '';
      }
      const scoreData = {
        score: gameStateRef.current.score,
        fid:fid,
        userName:user_name,
        displayName:diplay_name,
        pfpUrl:pfp_url,
        gameplayData: {
          shotsFired: gameplayDataRef.current.shotsFired,
          enemiesDestroyed: gameplayDataRef.current.enemiesDestroyed,
          powerupsCollected: gameplayDataRef.current.powerupsCollected,
          playDuration: Date.now() - gameplayDataRef.current.startTime,
          timestamp: Date.now()
        }
      };

      if(scoreData.fid === 0) return;
  
      // 送信前のデータを確認
      // console.log('Data to be sent:', JSON.stringify(scoreData));
  
      const signature = signData(scoreData);
      // console.log('Generated signature:', signature);
  
      // データ送信時の形式を明確に
      const requestBody = {
        data: scoreData,  // このように明示的にdataプロパティとして包む
        signature
      };
  
      // console.log('Full request body:', JSON.stringify(requestBody));
  
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit score');
      }

      setScoreSubmitted(true); // 送信成功時にフラグを立てる
      // スコア送信後に最新のランキングを取得
      await fetchRankings();
      console.log('Score submitted successfully');
    } catch (error) {
      console.error('Error submitting score:', error);
    }
  };

  const ENEMY_TYPES = {
    NORMAL: 'normal' as const,
    SHOOTER: 'shooter' as const,
    FAST: 'fast' as const
  };

  type EnemyType = typeof ENEMY_TYPES[keyof typeof ENEMY_TYPES];

  // 敵の弾生成パターン関数
  const createEnemyBullets = (enemy: Enemy, timestamp: number): EnemyBullet[] => {
    const bullets: EnemyBullet[] = [];
    let baseSpeed = 4;
    const pattern = Math.random();

    if(gameStateRef.current.bossClearCount === 0){
      baseSpeed = baseSpeed * 0.6;
    }else{
      baseSpeed = baseSpeed * 1.2;
    }
    
    if (enemy.type === 'shooter') {
      // 射撃タイプの敵の弾幕パターン
      if (pattern < 0.4) {
        // プレイヤーを狙い撃つ
        const dx = gameStateRef.current.playerPosition - enemy.x;
        const dy = PLAYER_Y - enemy.y;
        const angle = Math.atan2(dy, dx);
        bullets.push({
          x: enemy.x,
          y: enemy.y,
          id: Date.now(),
          type: 'enemy',
          vx: Math.cos(angle) * baseSpeed,
          vy: Math.sin(angle) * baseSpeed
        });
      } else if (pattern < 0.7) {
        // 2方向スプレッド
        [-0.3, 0.3].forEach(angleOffset => {
          bullets.push({
            x: enemy.x,
            y: enemy.y,
            id: Date.now() + bullets.length,
            type: 'enemy',
            vx: Math.sin(angleOffset) * baseSpeed,
            vy: baseSpeed
          });
        });
      } else {
        if (Math.random() < 0.5) {
          // 3方向スプレッド
          [-0.4, 0, 0.4].forEach(angleOffset => {
            bullets.push({
              x: enemy.x,
              y: enemy.y,
              id: Date.now() + bullets.length,
              type: 'enemy',
              vx: Math.sin(angleOffset) * baseSpeed,
              vy: baseSpeed
            });
          });
        } else {
          // 円形8方向
          for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2) / 8;
            bullets.push({
              x: enemy.x,
              y: enemy.y,
              id: Date.now() + i,
              type: 'enemy',
              vx: Math.cos(angle) * baseSpeed,
              vy: Math.sin(angle) * baseSpeed
            });
          }
        }
      }
    } else {
      // 通常タイプと高速タイプの敵の弾幕パターン
      const bulletSpeed = enemy.type === 'fast' ? baseSpeed * 1.2 : baseSpeed;
  
      if (pattern < 0.5) {
        // まっすぐ下に発射（基本パターン）
        bullets.push({
          x: enemy.x,
          y: enemy.y,
          id: Date.now(),
          type: 'enemy',
          vx: 0,
          vy: bulletSpeed
        });
      } else if (pattern < 0.8) {
        // 2方向スプレッド
        [-0.2, 0.2].forEach(angleOffset => {
          bullets.push({
            x: enemy.x,
            y: enemy.y,
            id: Date.now() + bullets.length,
            type: 'enemy',
            vx: Math.sin(angleOffset) * bulletSpeed,
            vy: bulletSpeed
          });
        });
      } else {
        // 3方向スプレッド
        [-0.3, 0, 0.3].forEach(angleOffset => {
          bullets.push({
            x: enemy.x,
            y: enemy.y,
            id: Date.now() + bullets.length,
            type: 'enemy',
            vx: Math.sin(angleOffset) * bulletSpeed,
            vy: bulletSpeed
          });
        });
      }
    }
    
    return bullets;
  };

// ボスの攻撃処理
const updateBossAttack = (timestamp: number, boss: Boss) => {
  if (boss.state !== 'fighting') return; // fightingの時だけ攻撃する

  const currentPattern = boss.phase === 0 ? BOSS_ATTACK_PATTERNS.AIMED_BURST :
                        boss.phase === 1 ? BOSS_ATTACK_PATTERNS.SPREAD_SHOT :
                        BOSS_ATTACK_PATTERNS.CIRCLE_SHOT;

  // セット内の発射処理
  if (timestamp - boss.lastShot > currentPattern.interval) {
    if (boss.shotCount < currentPattern.shots) {
      // 攻撃パターンに応じた弾の生成
      switch (currentPattern) {
        case BOSS_ATTACK_PATTERNS.AIMED_BURST: // 自機狙い10連射
          const dx = gameStateRef.current.playerPosition - boss.x;
          const dy = PLAYER_Y - boss.y;
          const angle = Math.atan2(dy, dx);
          gameStateRef.current.enemyBullets.push({
            x: boss.x,
            y: boss.y,
            id: Date.now(),
            type: 'enemy',
            vx: Math.cos(angle) * 6,
            vy: Math.sin(angle) * 6
          });
          break;

        case BOSS_ATTACK_PATTERNS.SPREAD_SHOT: // 扇状発射
          const spreadAngle = Math.PI / 4;
          const baseAngle = -spreadAngle / 2 + (Math.PI / 2);
          if(gameStateRef.current.bossClearCount > 0){
            for (let i = 0; i < 8; i++) {
              const shotAngle = baseAngle + (spreadAngle * i / 7);
              gameStateRef.current.enemyBullets.push({
                x: boss.x,
                y: boss.y,
                id: Date.now() + i,
                type: 'enemy',
                vx: Math.cos(shotAngle) * 3,
                vy: Math.sin(shotAngle) * 3
              });
            }
          }else{
            for (let i = 0; i < 6; i++) {
              const shotAngle = baseAngle + (spreadAngle * i / 5);
              gameStateRef.current.enemyBullets.push({
                x: boss.x,
                y: boss.y,
                id: Date.now() + i,
                type: 'enemy',
                vx: Math.cos(shotAngle) * 3,
                vy: Math.sin(shotAngle) * 3
              });
            }
          }
          break;

        case BOSS_ATTACK_PATTERNS.CIRCLE_SHOT: // 円形発射
          for (let i = 0; i < 16; i++) {
            const angle = (i * Math.PI * 2) / 16;
            gameStateRef.current.enemyBullets.push({
              x: boss.x,
              y: boss.y,
              id: Date.now() + i,
              type: 'enemy',
              vx: Math.cos(angle) * 4,
              vy: Math.sin(angle) * 4
            });
          }
          break;
      }

      boss.shotCount++;
      boss.lastShot = timestamp;
    } else if (timestamp - boss.lastShot > currentPattern.setInterval) {
      // セット完了後の処理
      boss.shotCount = 0;
      boss.setCount++;
      
      // 全セット完了後は次のフェーズへ
      if (boss.setCount >= currentPattern.sets) {
        boss.phase = (boss.phase + 1) % 3;
        boss.setCount = 0;
      }
    }
  }
};


  const initGame = () => {
    // 通常のプレイ回数制限チェック
    if (playLimit !== null && playCount >= playLimit && !playPermission) {
      return; // プレイ制限に達して許可もない場合は開始しない
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    

    // 初期の星を生成（50個程度）
    const initialStars: Star[] = Array.from({ length: 25 }, () => ({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        size: Math.random() * 1.2 + 0.2,    // 0.2-1.0のサイズに変更（より小さく）
        speed: Math.random() * 1.5 + 0.5,   // 0.5-2.0の速度（やや遅めに）
        brightness: Math.random() * 0.5 + 0.5
    }));

    gameStateRef.current = {
      playerPosition: 160,
      playerBullets: [],
      enemyBullets: [],
      enemies: [],
      powerUps: [],
      explosions: [],
      shotLevel: 1,
      score: 0,
      lastRender: 0,
      lastEnemySpawn: 0,
      stars: initialStars,
      isFirePressed:false,
      lastShot: 0,
      boss:null,
      isBossPhase:false,
      lastBossScore: 0,  // 初期値は0
      bossClearCount:0,
    };

    gameplayDataRef.current = {
      shotsFired: 0,
      enemiesDestroyed: 0,
      powerupsCollected: 0,
      startTime: 0
    };

    // プレイ回数をインクリメント
    setPlayCount(prev => Number(prev) + 1);
    // ゲーム開始時に許可フラグをリセット
    setPlayPermission(false);
    // 支払い確認フラグもリセット
    setIsPaymentConfirmed(false);
    
    setScore(0);
    setGameState('playing');
    setScoreSubmitted(false); // スコア送信フラグをリセット
  };

  const spawnEnemy = (timestamp: number) => {
    if (timestamp - gameStateRef.current.lastEnemySpawn > 800) {
      // 通常のスポーン処理
      let baseEnemyCount = Math.floor(Math.random() * 3) + 2;
      
      // ボス未撃破の場合、敵の数を半分にする
      if (gameStateRef.current.bossClearCount === 0) {
        baseEnemyCount = Math.max(1, Math.floor(baseEnemyCount / 2)); // 最低1体は出現するようにする
      }
      
      // パワーアップ状態に応じて追加の敵をスポーン
      const powerLevel = gameStateRef.current.shotLevel;
      const totalEnemyCount = powerLevel === 3 ? baseEnemyCount + 4 : baseEnemyCount;
      
      for (let i = 0; i < totalEnemyCount; i++) {
        const enemyType = Math.random();
        // パワーアップ3の場合、shooter型の出現確率を上げる
        let type: EnemyType;
        let speed: number;
  
        // 通常の出現確率
        if (enemyType < 0.5) {
          type = 'normal';
          speed = 4;
        } else if (enemyType < 0.8) {
          type = 'shooter';
          speed = 1.5;
        } else {
          type = 'fast';
          speed = 4.2;
        }

  
        // より広い範囲からランダムな位置に出現
        const spawnPosition = Math.random() * (GAME_WIDTH - 40) + 20;
        
        const newEnemy: Enemy = {
          x: spawnPosition,
          y: -20 - (i * 30),
          id: Date.now() + i,
          lastShot: timestamp,
          type,
          speed
        };
  
        // パワーアップ3の場合、射撃間隔を短くする
        if (powerLevel === 3) {
          newEnemy.lastShot = timestamp; // 最初の射撃までの時間を短縮
          if (newEnemy.type === 'shooter') {
            newEnemy.speed *= 0.8; // シューター型は少しゆっくりに
          }
        }

        // パワーアップ3の場合、射撃間隔を短くする
        if (powerLevel === 2) {
          newEnemy.lastShot = timestamp; // 最初の射撃までの時間を短縮
          if (newEnemy.type === 'shooter') {
            newEnemy.speed *= 0.4; // シューター型は少しゆっくりに
          }
        }

        // 一度撃破するとハードモード突入
        if (gameStateRef.current.bossClearCount > 0) {
          // シューター型の出現確率を70%に
          if (enemyType < 0.8) {
            type = 'shooter';
            speed = 1.5;
          } else if (enemyType < 0.85) {
            type = 'fast';
            speed = 4.2;
          } else {
            type = 'normal';
            speed = 4;
          }

          newEnemy.lastShot = timestamp - 800; // 最初の射撃までの時間を短縮
          if (newEnemy.type === 'shooter') {
            newEnemy.speed *= 0.8; // シューター型は少しゆっくりに
          }

        }
        
  
        gameStateRef.current.enemies.push(newEnemy);
      }
      gameStateRef.current.lastEnemySpawn = timestamp;
    }
  };

  const shoot = () => {
    if (gameState !== 'playing') return;

    gameplayDataRef.current.shotsFired++;
    const shotCount = gameStateRef.current.shotLevel;
    const spreadAngle = Math.PI / 8;
    
    for (let i = 0; i < shotCount; i++) {
      const angle = (i - (shotCount - 1) / 2) * spreadAngle;
      const speed = 8;
      const vx = Math.sin(angle) * speed;
      const vy = -Math.cos(angle) * speed;
      
      gameStateRef.current.playerBullets.push({
        x: gameStateRef.current.playerPosition,
        y: PLAYER_Y,
        id: Date.now() + i,
        type: 'player',
        vx,
        vy
      });
    }
  };

  const updateGame = (timestamp: number) => {
    if (!gameStateRef.current.lastRender) {
      gameStateRef.current.lastRender = timestamp;
    }
    const deltaTime = timestamp - gameStateRef.current.lastRender;
    gameStateRef.current.lastRender = timestamp;


    // ボスフェーズの判定と生成
    if (!gameStateRef.current.isBossPhase && 
      gameStateRef.current.score > gameStateRef.current.lastBossScore && 
      (gameStateRef.current.score - gameStateRef.current.lastBossScore) >= (BOSS_COMMING_POINT * (gameStateRef.current.bossClearCount + 1))) {
    gameStateRef.current.isBossPhase = true;
    gameStateRef.current.lastBossScore = gameStateRef.current.score; // 現在のスコアを記録
    gameStateRef.current.boss = createBoss();
    gameStateRef.current.enemies = []; // ザコ敵をクリア
    

  }


    gameStateRef.current.stars = gameStateRef.current.stars.map(star => {
    const newY = star.y + star.speed * (deltaTime / 16);
    // 画面外に出た星を上端に戻す
    return newY > GAME_HEIGHT ? {
        ...star,
        y: -10,
        x: Math.random() * GAME_WIDTH
    } : {
        ...star,
        y: newY
    };
    });

    // 連射の処理
    if (gameState === 'playing' && gameStateRef.current.isFirePressed) {
        const shootInterval = 150; // 射撃間隔（ミリ秒）
        if (timestamp - gameStateRef.current.lastShot > shootInterval) {
            shoot();
            gameStateRef.current.lastShot = timestamp;
        }
    }



  // ボスフェーズとノーマルフェーズで分岐
  if (gameStateRef.current.isBossPhase && gameStateRef.current.boss) {
    const boss = gameStateRef.current.boss;
  
    switch (boss.state) {
      case 'appearing':
        // 登場演出の更新
        boss.appearProgress = Math.min(boss.appearProgress + (deltaTime / 2000), 1);
        boss.y = -50 + (boss.appearProgress * 150); // -50から100の位置まで移動
  
        if (boss.appearProgress >= 1) {
          boss.state = 'fighting';
        }
        break;
  
      case 'fighting':
        // 通常戦闘時の処理
        const time = timestamp / 1000;
        boss.x = GAME_WIDTH / 2 + Math.sin(time) * 100;
  
        // ボスの攻撃（登場完了後のみ）
        updateBossAttack(timestamp, boss);
  
        // プレイヤーの弾との衝突判定
        gameStateRef.current.playerBullets.forEach((bullet, bulletIndex) => {
          const distance = Math.sqrt(
            Math.pow(bullet.x - boss.x, 2) + 
            Math.pow(bullet.y - boss.y, 2)
          );
          if (distance < 40) {
            gameStateRef.current.playerBullets.splice(bulletIndex, 1);
            boss.hp -= 10;
  
            // 爆発エフェクト（小）
            gameStateRef.current.explosions.push({
              x: bullet.x,
              y: bullet.y,
              id: Date.now(),
              size: 0.5,
              duration: 200,
              startTime: Date.now()
            });
  
            // ボス撃破判定
            if (boss.hp <= 0) {
              boss.state = 'dying';
              boss.appearProgress = 0; // 消滅演出用に使用
            }
          }
        });
        break;
  
      case 'dying':
        // 撃破演出
        boss.appearProgress = Math.min(boss.appearProgress + (deltaTime / 1500), 1);
        
        // 連続爆発
        if (Math.random() < 0.3) {
          gameStateRef.current.explosions.push({
            x: boss.x + (Math.random() - 0.5) * 80,
            y: boss.y + (Math.random() - 0.5) * 80,
            id: Date.now(),
            size: 1 + Math.random(),
            duration: 800,
            startTime: Date.now()
          });
        }
  
        // 演出完了後に終了処理
        if (boss.appearProgress >= 1) {
          gameStateRef.current.score += BOSS_BONUS_SCORE;
          gameStateRef.current.lastBossScore = gameStateRef.current.score; // ボーナス込みのスコアを記録
          setScore(gameStateRef.current.score);
          gameStateRef.current.boss = null;
          gameStateRef.current.isBossPhase = false;
          gameStateRef.current.enemyBullets = [];

          gameStateRef.current.bossClearCount += 1; // 撃破数+1
        }
        break;
    }
  } else {
    // 通常の敵の生成と更新
    spawnEnemy(timestamp);
    // ... 既存の敵の更新処理
  }


    // プレイヤーの弾の移動
    gameStateRef.current.playerBullets = gameStateRef.current.playerBullets
      .map(bullet => ({ 
        ...bullet,
        x: bullet.x + bullet.vx * (deltaTime / 16),
        y: bullet.y + bullet.vy * (deltaTime / 16)
      }))
      .filter(bullet => bullet.y > -10);

    // 敵の弾の移動
    gameStateRef.current.enemyBullets = gameStateRef.current.enemyBullets
      .map(bullet => ({
        ...bullet,
        x: bullet.x + bullet.vx * (deltaTime / 16),
        y: bullet.y + bullet.vy * (deltaTime / 16)
      }))
      .filter(bullet => 
        bullet.y < GAME_HEIGHT + 10 && 
        bullet.y > -10 &&
        bullet.x > -10 &&
        bullet.x < GAME_WIDTH + 10
      );

    // パワーアップの移動と衝突判定
    gameStateRef.current.powerUps = gameStateRef.current.powerUps
      .map(powerUp => ({
        ...powerUp,
        y: powerUp.y + powerUp.speed * (deltaTime / 16)
      }))
      .filter(powerUp => {
        const distance = Math.sqrt(
          Math.pow(powerUp.x - gameStateRef.current.playerPosition, 2) + 
          Math.pow(powerUp.y - PLAYER_Y, 2)
        );

        if (distance < 30) {
          gameStateRef.current.shotLevel = Math.min(gameStateRef.current.shotLevel + 1, 3);
          gameplayDataRef.current.powerupsCollected++;
          gameStateRef.current.score += 500;
          setScore(gameStateRef.current.score);
          return false;
        }

        return powerUp.y < GAME_HEIGHT + 10;
      });

    // 敵の移動と攻撃
    gameStateRef.current.enemies = gameStateRef.current.enemies
    .map(enemy => {
      // 敵が射撃可能な高さにいる場合のみ発射
      if (enemy.y < ENEMY_SHOOT_LIMIT_Y) {
        const shootInterval = enemy.type === 'shooter' ? 800 :  
                            enemy.type === 'fast' ? 1200 :     
                            1000;                              
  
        if (timestamp - enemy.lastShot > shootInterval) {
          const newBullets = createEnemyBullets(enemy, timestamp);
          gameStateRef.current.enemyBullets.push(...newBullets);
          enemy.lastShot = timestamp;
        }
      }
  
      return {
        ...enemy,
        y: enemy.y + enemy.speed * (deltaTime / 16)
      };
    })
    .filter(enemy => enemy.y < GAME_HEIGHT - 20);

    // プレイヤーの弾と敵の衝突判定
    gameStateRef.current.playerBullets.forEach((bullet, bulletIndex) => {
      gameStateRef.current.enemies.forEach((enemy, enemyIndex) => {
        // 敵の種類によって衝突判定の範囲を変える
        let hitboxSize;
        switch (enemy.type) {
          case 'shooter':
            hitboxSize = 30;  // より大きい衝突判定
            break;
          case 'fast':
            hitboxSize = 20;  // より小さい衝突判定
            break;
          default:
            hitboxSize = 20;  // 標準の衝突判定
        }
    
        const distance = Math.sqrt(
          Math.pow(bullet.x - enemy.x, 2) + 
          Math.pow(bullet.y - enemy.y, 2)
        );
        if (distance < hitboxSize) {
          // 衝突処理
          gameStateRef.current.playerBullets.splice(bulletIndex, 1);
          gameStateRef.current.enemies.splice(enemyIndex, 1);
          gameStateRef.current.score += enemy.type === 'shooter' ? 200 : 100;
          setScore(gameStateRef.current.score);
    
          // 爆発エフェクトのサイズも敵のサイズに応じて調整
          gameStateRef.current.explosions.push({
            x: enemy.x,
            y: enemy.y,
            id: Date.now(),
            size: enemy.type === 'shooter' ? 2 : 1, // 大きい敵は大きい爆発
            duration: 500,
            startTime: Date.now()
          });

          // アイテムをドロップ（30%の確率）
          if (Math.random() < 0.1) {
            gameStateRef.current.powerUps.push({
              x: enemy.x,
              y: enemy.y,
              id: Date.now(),
              type: 'multiShot',
              speed: 2
            });
          }

          gameplayDataRef.current.enemiesDestroyed++;
        }
      });
    });

    // 敵の弾とプレイヤーの衝突判定のみでゲームオーバー
    gameStateRef.current.enemyBullets.forEach((bullet) => {
      const distance = Math.sqrt(
        Math.pow(bullet.x - gameStateRef.current.playerPosition, 2) + 
        Math.pow(bullet.y - PLAYER_Y, 2)
      );
      if (distance < 10) {
        // 爆発エフェクトを追加（プレイヤーの爆発）
        gameStateRef.current.explosions.push({
          x: gameStateRef.current.playerPosition,
          y: PLAYER_Y,
          id: Date.now(),
          size: 2,
          duration: 1000,
          startTime: Date.now()
        });
        setGameState('gameover');
        return;
      }
    });

    drawGame();

    if (gameState === 'playing') {
      animationFrameRef.current = requestAnimationFrame(updateGame);
    }
  };

const drawGame = () => {
  const canvas = gameAreaRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // 星の描画（背景）
  ctx.fillStyle = '#ffffff';
  gameStateRef.current.stars.forEach(star => {
    const alpha = star.brightness;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  if (gameState === 'start') {
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MONAD Shoot \'em ups', GAME_WIDTH / 2, GAME_HEIGHT / 3);
    return;
  }

  // プレイヤーの描画
  if (images.player && gameState === 'playing') {
    const playerImg = images.player;
    if (playerImg) {
      ctx.drawImage(
        playerImg,
        gameStateRef.current.playerPosition - 15,
        PLAYER_Y - 15,
        30,
        30
      );
    }
  }

  // プレイヤーの弾の描画
  ctx.fillStyle = '#fbbf24';
  gameStateRef.current.playerBullets.forEach(bullet => {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // 敵の弾の描画
  ctx.fillStyle = '#f87171';
  gameStateRef.current.enemyBullets.forEach(bullet => {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // パワーアップアイテムの描画
  const powerupImg = images.powerup;
  if (powerupImg) {
    gameStateRef.current.powerUps.forEach(powerUp => {
      ctx.drawImage(
        powerupImg,
        powerUp.x - 8,
        powerUp.y - 8,
        24,
        24
      );
    });
  }

// 敵の描画
gameStateRef.current.enemies.forEach(enemy => {
  let enemyImage = null;
  switch (enemy.type) {
    case 'shooter':
      enemyImage = images.shooter;
      // シューター型の敵は大きめ
      const shooterSize = 42; // 例: 30x30ピクセル
      if (enemyImage) {
        ctx.drawImage(
          enemyImage,
          enemy.x - shooterSize/2,  // 中心に配置するため半分のサイズを引く
          enemy.y - shooterSize/2,
          shooterSize,
          shooterSize
        );
      }
      break;
    case 'fast':
      enemyImage = images.fast;
      // 高速型の敵は小さめ
      const fastSize = 30; // 例: 15x15ピクセル
      if (enemyImage) {
        ctx.drawImage(
          enemyImage,
          enemy.x - fastSize/2,
          enemy.y - fastSize/2,
          fastSize,
          fastSize
        );
      }
      break;
    default:
      enemyImage = images.enemy;
      // 通常の敵は標準サイズ
      const normalSize = 30; // 例: 20x20ピクセル
      if (enemyImage) {
        ctx.drawImage(
          enemyImage,
          enemy.x - normalSize/2,
          enemy.y - normalSize/2,
          normalSize,
          normalSize
        );
      }
  }
});
  // ボスの描画
  if (gameStateRef.current.boss) {
    const boss = gameStateRef.current.boss;

    // 登場/撃破演出中は半透明に
    if (boss.state === 'appearing') {
      ctx.globalAlpha = boss.appearProgress;
    } else if (boss.state === 'dying') {
      ctx.globalAlpha = 1 - boss.appearProgress;
    }
  
    // ボス画像の描画
    const bossImg = images.boss;
    if (bossImg) {
      const bossSize = 150; // ボスの大きさを設定
      ctx.drawImage(
        bossImg,
        boss.x - bossSize/2,
        boss.y - bossSize/2,
        bossSize,
        bossSize
      );
    }
  
    // 透明度を元に戻す
    ctx.globalAlpha = 1;
  
    // HPゲージ
    const hpWidth = 200;
    const hpHeight = 10;
    const hpX = (GAME_WIDTH - hpWidth) / 2;
    const hpY = 20;

    // HPゲージの背景
    ctx.fillStyle = '#333';
    ctx.fillRect(hpX, hpY, hpWidth, hpHeight);

    // 現在のHP
    const hpRatio = boss.hp / boss.maxHp;
    ctx.fillStyle = hpRatio > 0.5 ? '#00ff00' : 
                   hpRatio > 0.2 ? '#ffff00' : 
                   '#ff0000';
    ctx.fillRect(hpX, hpY, hpWidth * hpRatio, hpHeight);

    // HPゲージの枠
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(hpX, hpY, hpWidth, hpHeight);
  }
  // 爆発エフェクトの描画
  gameStateRef.current.explosions = gameStateRef.current.explosions.filter(explosion => {
    const elapsed = Date.now() - explosion.startTime;
    if (elapsed >= explosion.duration) return false;
    
    const progress = elapsed / explosion.duration;
    const size = explosion.size * (1 + progress * 20);
    const alpha = 1 - progress;
    
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, size, 0, Math.PI * 2);
    ctx.fill();
    
    // 爆発の中心の白い部分
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = alpha * 0.8;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalAlpha = 1;
    return true;
  });

  // ゲームオーバー時の半透明レイヤーとテキスト表示は削除
  // renderGameOver関数で代替するため
};
    // マウス用のイベントハンドラを修正
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        if (gameState === 'playing' && !isMobile) {
        gameStateRef.current.isFirePressed = true;
        }
    };
  
  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isMobile) {
      gameStateRef.current.isFirePressed = false;
    }
  };


  const handleTouchStart = (e: React.TouchEvent) => {
    if (gameState !== 'playing') return;
    const touch = e.touches[0];
    const rect = gameAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touchX = touch.clientX - rect.left;
    touchStateRef.current.touchStartX = touchX;
    touchStateRef.current.initialPlayerPos = gameStateRef.current.playerPosition;
    gameStateRef.current.isFirePressed = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (
      gameState !== 'playing' || 
      touchStateRef.current.touchStartX === null || 
      touchStateRef.current.initialPlayerPos === null
    ) return;
    
    const touch = e.touches[0];
    const rect = gameAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentTouchX = touch.clientX - rect.left;
    const deltaX = currentTouchX - touchStateRef.current.touchStartX;
    gameStateRef.current.playerPosition = Math.max(20, Math.min(GAME_WIDTH - 20,
      touchStateRef.current.initialPlayerPos + deltaX
    ));
  };

  const handleTouchEnd = () => {
    if (gameState !== 'playing') return;
    touchStateRef.current.touchStartX = null;
    touchStateRef.current.initialPlayerPos = null;
    gameStateRef.current.isFirePressed = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    e.preventDefault();
    if (gameState !== 'playing' || isMobile) return;
    const rect = gameAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    gameStateRef.current.playerPosition = Math.max(20, Math.min(GAME_WIDTH - 20, mouseX));
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (gameState === 'playing' && !isMobile) {
      shoot();
    }
  };

  useEffect(() => {
    drawGame();
    if (gameState === 'playing') {
      animationFrameRef.current = requestAnimationFrame(updateGame);
    }
    if (gameState === 'gameover') {
      if(!IS_DEBUG){
        submitScore();
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState]);

  // 初回ロード時にランキングデータを取得
  useEffect(() => {
    if (isSDKLoaded && context?.user.fid) {
      fetchRankings();
    }
  }, [isSDKLoaded, context]);

  const openFrameIntro = useCallback(() => {
    sdk.actions.openUrl('https://warpcast.com/saxophone55.eth/0xe1c34641');
  }, []);

  const openShare = useCallback((sentence:string) => {
    const url = process.env.NEXT_PUBLIC_URL || "https://monad-shooting.vercel.app/";
    //const url = "https://moxie-frame-kit.vercel.app/";
    const inputSentence = sentence + "\n\nMini App by @saxophone55.eth";
    const shareUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(inputSentence)}&embeds%5B%5D=${encodeURIComponent(url)}`
    sdk.actions.openUrl(shareUrl);
  }, []);
  

  const handleStartGame = () => {
    initGame();
  };

  // スタート画面のボタン表示を条件分岐
  const renderStartButton = () => {
    if (isLoading) {
      return <div className="text-white">Loading...</div>;
    }

    // 常に表示する共通ボタン
    const rankingButton = (
      <button
        onClick={() => setGameState('ranking')}
        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg
                  transition-colors duration-200 w-full"
      >
        Rankings
      </button>
    );

    if (!isConnected) {
      return (
        <div className="absolute top-2/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                    flex flex-col gap-4 w-4/5 max-w-xs">
          <button
            onClick={handleConnectAndSwitchChain}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg
                       transition-colors duration-200"
            disabled={isConnectingAndSwitching || isConnectPending}
          >
            {isConnectingAndSwitching || isConnectPending ? 'Connecting...' : 'Connect Wallet'}
          </button>
          {rankingButton}
          {paymentError && (
            <div className="text-red-500 text-sm mt-1 text-center">
              {paymentError}
            </div>
          )}
        </div>
      );
    }

    if (chainId !== monadTestnet.id) {
      return (
        <div className="absolute top-2/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                    flex flex-col gap-4 w-4/5 max-w-xs">
          <button
            onClick={handleConnectAndSwitchChain}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg
                       transition-colors duration-200"
            disabled={isConnectingAndSwitching || isSwitchChainPending}
          >
            {isConnectingAndSwitching || isSwitchChainPending ? 'Switching...' : 'Switch to Monad Testnet'}
          </button>
          {rankingButton}
          {paymentError && (
            <div className="text-red-500 text-sm mt-1 text-center">
              {paymentError}
            </div>
          )}
          <div className="text-white text-center text-xs mt-1">
            Currently on: {getAccount(config).chain?.name || 'Unknown Network'}
          </div>
        </div>
      );
    }

    // 接続済み かつ Monad Testnet にいる場合
    if (playLimit !== null && playCount >= playLimit && !playPermission) {
      return (
      <div className="absolute top-2/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                  flex flex-col gap-4 w-4/5 max-w-xs">
        {!isPaymentConfirmed ? (
          <>
            <button
              onClick={handleSendEth}
              className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg
                           transition-colors duration-200"
              disabled={isInitiatingPayment || isSendTxPending}
            >
              {isInitiatingPayment ? 'Processing...' :
               isSendTxPending ? 'Sending...' :
               `Pay ${PLAY_AMOUNT} MON for +1 Play`}
            </button>
            {paymentError && ( 
              <div className="text-red-500 text-sm mt-1 text-center">
                {paymentError}
              </div>
            )}
            {isSendTxError && (
              <div className="text-red-500 text-sm text-center">
                {sendTxError.message}
              </div>
            )}
            {txHash && (
              <div className="text-sm text-white text-center">
                <div>Transaction: {txHash.slice(0, 6)}...{txHash.slice(-4)}</div>
                <div>
                  Status:{" "}
                  {isConfirming
                    ? "Confirming..."
                    : isConfirmed
                    ? "Confirmed!"
                    : "Pending"}
                </div>
              </div>
            )}
          </>
        ) : (
          <button
            onClick={handleStartGame}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg
                         transition-colors duration-200"
          >
            Start Game
          </button>
        )}
        {rankingButton}
      </div>
      );
    }

    return (
      <div className="absolute top-2/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                    flex flex-col gap-4 w-4/5 max-w-xs">
        <button
          onClick={handleStartGame} // initGame から handleStartGame に変更 (プレイ回数消費のため)
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg
                   transition-colors duration-200"
        >
          Start Game
          {playLimit !== null && (
            <div className="text-sm">
              {Math.max(0, playLimit - playCount)} Plays Remaining
            </div>
          )}
        </button>
        {rankingButton}
      </div>
    );
  };

  // ゲームオーバー画面のボタン表示も条件分岐
  const renderGameOverButtons = () => {
    // 共通ボタンの定義
    const rankingAndShareButtons = (
      <div className="flex gap-3 mt-4 w-full max-w-xs px-4">
        <button
          onClick={() => setGameState('ranking')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg
                   transition-colors duration-200 flex-1"
        >
          Rankings
        </button>
        <button
          onClick={() => openShare(`I scored ${score.toLocaleString()} points in MONAD Shooter!`)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg
                   transition-colors duration-200 flex-1"
        >
          Share
        </button>
      </div>
    );

    const mintNftSection = (
      <div className="bg-gray-800 bg-opacity-90 rounded-xl p-1 mx-4 w-full max-w-xs shadow-lg border border-gray-700">
        <div className="text-center mb-1">
          <h3 className="text-white text-lg font-bold">⭐Mint Your Achievement NFT⭐</h3>
        </div>
        <div className="relative bg-gray-900 rounded-lg p-1 mb-2">
          <img 
            src={`/images/nft-preview-${getScoreTier(score)}.png`} 
            alt="NFT Preview" 
            className="w-full h-auto object-contain mx-auto"
          />
          <div className="absolute top-2 right-2 bg-gray-800 bg-opacity-80 px-2 py-1 rounded-md">
            <span className="text-xs font-medium text-white uppercase">{getScoreTier(score)}</span>
          </div>
        </div>
        <button
          onClick={mintNFT}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg
                  transition-colors duration-200 w-full mb-3"
          disabled={isMintingNFT || isMintConfirming || mintSuccess || isConnectingAndSwitching || isConnectPending || (chainId !== monadTestnet.id && !isSwitchChainPending)}
        >
          {isConnectingAndSwitching || isConnectPending ? 'Connecting Wallet...' :
           isSwitchChainPending ? 'Switching Network...' :
           isMintingNFT ? 'Processing Mint...' :
           isMintConfirming ? 'Confirming Mint...' :
           mintSuccess ? 'NFT Minted!' :
           'Mint NFT (0.1 MON)'}
        </button>
        {mintError && (
          <div className="text-red-400 text-sm mb-3 text-center">
            {mintError}
          </div>
        )}
        {mintTxHash && (
          <div className="text-gray-300 text-sm mb-3 text-center">
            TX: {mintTxHash.slice(0, 6)}...{mintTxHash.slice(-4)}
          </div>
        )}
      </div>
    );

    if (playLimit !== null && playCount >= playLimit && !playPermission) {
      return (
        <div className="absolute inset-0 flex flex-col items-center">
          <div className="mt-1 text-center">
            <h2 className="text-white text-2xl font-bold mb-1">Game Over</h2>
          </div>
          {mintNftSection}
          
          {/* ウォレット接続、ネットワーク切り替え、支払いボタン */} 
          <div className="mt-3 w-full max-w-xs px-4">
            {!isConnected ? (
              <button
                onClick={handleConnectAndSwitchChain}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg
                         transition-colors duration-200 w-full mb-1"
                disabled={isConnectingAndSwitching || isConnectPending}
              >
                {isConnectingAndSwitching || isConnectPending ? 'Connecting...' : 'Connect Wallet to Pay for Next Play'}
              </button>
            ) : chainId !== monadTestnet.id ? (
              <button
                onClick={handleConnectAndSwitchChain}
                className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg
                           transition-colors duration-200 w-full mb-1"
                disabled={isConnectingAndSwitching || isSwitchChainPending}
              >
                {isConnectingAndSwitching || isSwitchChainPending ? 'Switching...' : 'Switch to Monad Testnet to Pay'}
              </button>
            ) : !isPaymentConfirmed ? (
              <button
                onClick={handleSendEth}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg
                         transition-colors duration-200 w-full mb-1"
                disabled={isInitiatingPayment || isSendTxPending}
              >
                {isInitiatingPayment ? 'Processing...' :
                 isSendTxPending ? 'Sending...' : 
                 `Pay ${PLAY_AMOUNT} MON for +1 Play`}
              </button>
            ) : (
               <button
                onClick={handleStartGame} // 支払いが済んでいれば直接スタート
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg
                         transition-colors duration-200 w-full mb-1"
              >
                Start Next Game
              </button>
            )}
            {paymentError && ( 
              <div className="text-red-400 text-sm mt-1 text-center">
                {paymentError}
              </div>
            )}
            {isSendTxError && (
              <div className="text-red-500 text-sm text-center mb-2">
                {sendTxError.message}
              </div>
            )}
            {txHash && (  
              <div className="text-sm text-white text-center mb-2">
                <div>TX: {txHash.slice(0, 6)}...{txHash.slice(-4)}</div>
                <div>
                  Status: {isConfirming ? "Confirming..." : isConfirmed ? "Confirmed!" : "Pending"}
                </div>
              </div>
            )}
          </div>
          {rankingAndShareButtons}
        </div>
      );
    }

    // 通常のゲームオーバー画面（プレイ回数制限なし、またはまだ余裕がある場合）
    return (
      <div className="absolute inset-0 flex flex-col items-center">
        <div className="mt-4 text-center">
          <h2 className="text-white text-2xl font-bold mb-1">Game Over</h2>
        </div>
        {mintNftSection}
        <div className="w-full max-w-xs px-4 mt-3">
          <button
            onClick={handleStartGame}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg
                     transition-colors duration-200 w-full mb-3"
          >
            Play Again
            {playLimit !== null && (
                <div className="text-sm">
                  {Math.max(0, playLimit - playCount)} Plays Remaining
                </div>
            )}
          </button>
        </div>
        {rankingAndShareButtons}
      </div>
    );
  };

  // ゲームオーバー表示
  const renderGameOver = () => {
    return (
      <div className="absolute inset-0 bg-black bg-opacity-60">
        {renderGameOverButtons()}
      </div>
    );
  };

  useEffect(() => {
    if (isConfirmed && txHash) {
      setIsPaymentConfirmed(true);
      // プレイ回数を増やすのではなく、ゲーム開始許可フラグを設定
      setPlayPermission(true);
      setTxHash(null);
    }
  }, [isConfirmed, txHash]);

  // NFTミント用の署名を取得する関数
  const getMintSignature = async () => {
    if (!isConnected || !address) {
      console.error('Wallet not connected');
      // ウォレットが接続されていない場合、接続を試みる
      await handleConnectAndSwitchChain();
      // handleConnectAndSwitchChain内でエラーが発生した場合やユーザーが接続をキャンセルした場合を考慮し、
      // 再度 isConnected と address をチェックするか、handleConnectAndSwitchChain の結果をハンドリングする必要があるかもしれません。
      // ここではシンプルに return します。接続成功後に再度この関数が呼ばれることを期待します。
      if (!isConnected || !address) { // 再度チェック
        return null; // 接続されなければnullを返す
      }
    }

    try {
      setIsMintingNFT(true);
      setMintError(null);

      const response = await fetch('/api/mint-signature', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerAddress: address,
          score: gameStateRef.current.score,
          fid: context?.user.fid || 0
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get signature');
      }

      const data = await response.json();
      setMintSignature(data);
      return data;
    } catch (error) {
      console.error('Signature error:', error);
      setMintError(error instanceof Error ? error.message : 'Failed to get signature');
      return null;
    }
  };

  // NFTをミントする関数
  const mintNFT = async () => {
    if (!isConnected || !address) {
      await handleConnectAndSwitchChain();
      return;
    }

    try {
      setIsMintingNFT(true);
      setMintError(null);

      // 署名がない場合は取得
      let sig = mintSignature;
      if (!sig) {
        sig = await getMintSignature();
        if (!sig) return;
      }

      await switchChain({ chainId: monadTestnet.id });
      console.log('NFT_CONTRACT_ADDRESS:', NFT_CONTRACT_ADDRESS);
      console.log('sig:', sig);
      // コントラクト呼び出しでNFTをミント
      writeContractAsync({
        address: NFT_CONTRACT_ADDRESS as `0x${string}`,
        abi: awardNFTAbi,
        functionName: 'mintWithSig',
        args: [
          BigInt(sig.parameters.score),
          BigInt(sig.parameters.nonce),
          BigInt(sig.parameters.expiry),
          sig.signature as `0x${string}`
        ],
        value: parseEther("0.1") // ミント料金（コントラクトの設定に合わせて調整）
      }, {
        onSuccess: (hash) => {
          setMintTxHash(hash);
        },
      });
    } catch (error) {
      console.error('NFT minting error:', error);
      setMintError(error instanceof Error ? error.message : 'Failed to mint NFT');
    } finally {
      setIsMintingNFT(false);
    }
  };

  // ミントのトランザクション確認を監視
  const { isLoading: isMintConfirming, isSuccess: isMintConfirmed } =
    useWaitForTransactionReceipt({
      hash: mintTxHash as `0x${string}`,
    });

  // ミント成功時の処理
  useEffect(() => {
    if (isMintConfirmed && mintTxHash) {
      console.log('Mint confirmed:', mintTxHash);
      setMintSuccess(true);
      // リセットは少し遅らせる
      setTimeout(() => {
        setMintTxHash(null);
        setMintSignature(null);
      }, 5000);
    }
  }, [isMintConfirmed, mintTxHash]);

  // ゲームオーバー時にNFTミント状態をリセット
  useEffect(() => {
    if (gameState === 'gameover') {
      setMintSuccess(false);
      setMintError(null);
      setMintTxHash(null);
      setMintSignature(null);
      // if(!IS_DEBUG){
      //   submitScore(); <--- この行を削除
      // }
    }
  }, [gameState]);

  // スコアに応じたティアを返す関数
  const getScoreTier = (score: number) => {
    if (score >= 50000) return 'gold';
    if (score >= 35000) return 'silver';
    return 'bronze';
  };

  return (
    <div 
      className="w-full max-w-lg mx-auto flex flex-col items-center p-4 select-none touch-none"
      onTouchStart={(e) => gameState !== 'ranking' && e.preventDefault()}
      onTouchMove={(e) => gameState !== 'ranking' && e.preventDefault()}
      style={{ 
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      <div className="mb-2 text-xl font-bold select-none">Score: {score}</div>
      
      <div className="relative">
        {gameState === 'ranking' ? (
            isLoadingRankings ? (
              <div className="w-full h-[600px] flex items-center justify-center bg-gray-900 text-white">
                Loading...
              </div>
            ) : (
              <div className="w-full h-[600px] overflow-y-auto">
                <RankingBoard 
                  rankings={rankings}
                  onBack={() => setGameState('start')}
                />
              </div>
            )
          ) : (
            <canvas
            ref={gameAreaRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="rounded-lg touch-none select-none"
            style={{ 
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none'
            }}
            onMouseMove={gameState === 'playing' && !isMobile ? handleMouseMove : undefined}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}  // マウスがcanvasから出た時も射撃を停止
            onContextMenu={(e) => e.preventDefault()}
            onTouchStart={gameState === 'playing' ? handleTouchStart : undefined}
            onTouchMove={gameState === 'playing' ? handleTouchMove : undefined}
            onTouchEnd={handleTouchEnd}
            />
          )}

        {gameState === 'start' && renderStartButton()}
        {gameState === 'gameover' && renderGameOver()}

      </div>
      <div className="mt-4 text-sm text-gray-600 text-center select-none">
        Swipe/Mouse to move, tap/click to shoot
      </div>
    </div>
  );
};

export default ShootingGame;

