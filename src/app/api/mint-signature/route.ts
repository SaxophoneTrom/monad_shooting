import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

// 環境変数から署名者の秘密鍵を取得（実際のプロダクションではセキュアに管理する必要があります）
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY || '';
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS || '';
const CONTRACT_NAME = process.env.NFT_CONTRACT_NAME || 'MONAD Shoot\'em ups';
const CONTRACT_VERSION = process.env.NFT_CONTRACT_VERSION || '1';
const CHAIN_ID = Number(process.env.CHAIN_ID || '10143');

/**
 * EIP-712署名を生成する関数
 * @param playerAddress - プレイヤーのイーサリアムアドレス
 * @param score - 獲得スコア
 * @param nonce - リプレイ攻撃防止用のナンス
 * @param expiryTime - 署名の有効期限（UNIXタイムスタンプ）
 * @param contractAddress - NFTコントラクトのアドレス
 * @param privateKey - 署名者の秘密鍵
 * @returns EIP-712署名
 */
async function generateMintSignature(
  playerAddress: string,
  score: number,
  nonce: number,
  expiryTime: number,
  contractAddress: string,
  privateKey: string
): Promise<{
  signature: string;
  parameters: {
    score: number;
    nonce: number;
    expiry: number;
  }
}> {
  // ドメインデータ
  const domain = {
    name: CONTRACT_NAME,
    version: CONTRACT_VERSION,
    chainId: CHAIN_ID,
    verifyingContract: contractAddress
  };
  
  // タイプ定義
  const types = {
    Mint: [
      { name: 'player', type: 'address' },
      { name: 'score', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'contract', type: 'address' }
    ]
  };
  
  // 値（数値は文字列に変換する）
  const value = {
    player: playerAddress,
    score: score.toString(),
    nonce: nonce.toString(),
    expiry: expiryTime.toString(),
    contract: contractAddress
  };
  
  // 署名者を作成
  const wallet = new ethers.Wallet(privateKey);
  
  // TypeHashをログ出力（デバッグ用）
  const typeHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("Mint(address player,uint256 score,uint256 nonce,uint256 expiry,address contract)")
  );
  console.log("TypeHash:", typeHash);
  
  // EIP-712署名を生成
  const signature = await wallet._signTypedData(domain, types, value);
  
  console.log("Debug Info:");
  console.log("Domain:", domain);
  console.log("Value:", value);
  console.log("Signature:", signature);
  
  return {
    signature,
    parameters: {
      score,
      nonce,
      expiry: expiryTime
    }
  };
}

export async function POST(request: Request) {
  // 署名者の秘密鍵が設定されていない場合はエラー
  if (!SIGNER_PRIVATE_KEY) {
    console.error('署名者の秘密鍵が設定されていません');
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { playerAddress, score, fid } = body;

    // 必須パラメータの検証
    if (!playerAddress || typeof score !== 'number') {
      return NextResponse.json({ error: '無効なリクエストパラメータ' }, { status: 400 });
    }

    // スコアの検証
    if (score < 0 || score > 1000000) {
      return NextResponse.json({ error: '無効なスコア値' }, { status: 400 });
    }

    // コントラクトアドレスの検証
    if (!NFT_CONTRACT_ADDRESS || NFT_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      console.error('NFTコントラクトアドレスが設定されていません');
      return NextResponse.json({ error: 'サーバー設定エラー - コントラクトアドレスが未設定' }, { status: 500 });
    }

    // ナンス値の生成（FID + タイムスタンプを使用）
    const nonce = fid ? fid * 1000000 + Date.now() : Date.now();
    
    // 有効期限（現在から1時間）
    const expiryTime = Math.floor(Date.now() / 1000) + 60 * 60;

    console.log('署名生成パラメータ:', {
      playerAddress,
      score,
      nonce,
      expiryTime,
      contractAddress: NFT_CONTRACT_ADDRESS,
      chainId: CHAIN_ID
    });

    // 署名の生成
    const signatureData = await generateMintSignature(
      playerAddress,
      score,
      nonce,
      expiryTime,
      NFT_CONTRACT_ADDRESS,
      SIGNER_PRIVATE_KEY
    );

    return NextResponse.json(signatureData);
  } catch (error) {
    console.error('署名生成エラー:', error);
    return NextResponse.json({ error: '署名の生成に失敗しました' }, { status: 500 });
  }
} 