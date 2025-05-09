import { NextRequest, NextResponse } from 'next/server';
import CryptoJS from 'crypto-js';
import pool from '~/lib/db';

interface GameplayData {
  shotsFired: number;
  enemiesDestroyed: number;
  powerupsCollected: number;
  playDuration: number;
  timestamp: number;
}

interface ScoreData {
  score: number;
  fid: number;
  gameplayData: GameplayData;
}

interface ScoreSubmission {
  data: ScoreData;
  signature: string;
}


export async function POST(req: NextRequest) {
  try {
    const { data, signature } = await req.json();

    // デバッグ用
    //console.log('Received data:', JSON.stringify(data));
    //console.log('Received signature:', signature);
    // 署名の検証前に、dataオブジェクトが期待通りの構造を持っているか確認
    if (!data || typeof data.score !== 'number' || !data.gameplayData) {
        return NextResponse.json(
          { error: 'Invalid data structure' },
          { status: 400 }
        );
    }


    // 署名の検証
    const hmacKey = process.env.NEXT_PUBLIC_HMAC_KEY;
    if (!hmacKey) {
      throw new Error('HMAC_KEY is not set');
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
    
    console.log('Normalized data for verification:', normalizedData);

    const expectedSignature = CryptoJS.HmacSHA256(normalizedData, hmacKey).toString();
    //console.log('Expected signature:', expectedSignature);

    if (expectedSignature !== signature) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // タイムスタンプの検証（5分以内）
    const now = Date.now();
    if (Math.abs(now - data.gameplayData.timestamp) > 5 * 60 * 1000) {
      return NextResponse.json(
        { error: 'Data too old' },
        { status: 400 }
      );
    }

    // スコアデータをデータベースに保存
    try {
        const query = `
        INSERT INTO monad.t_shooting_record (
          id,
          fid,
          user_name,
          display_name,
          pfp_url,
          score,
          shots_fired,
          enemies_destroyed,
          powerups_collected,
          play_duration,
          created_at
        ) VALUES (nextval('monad.shooting_record_id'), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id;
      `;
      const values = [
        data.fid,
        data.userName,
        data.displayName,
        data.pfpUrl,
        data.score,
        data.gameplayData.shotsFired,
        data.gameplayData.enemiesDestroyed,
        data.gameplayData.powerupsCollected,
        data.gameplayData.playDuration,
      ];

        const result = await pool.query(query,values);
      } catch (error: unknown) {
        console.error('Database error:', error);
      }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error saving score:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
    try {
      // 上位10件のスコアを取得
      const query = `
        SELECT 
        fid,
        user_name,
        display_name,
        pfp_url,
        score,
        shots_fired,
        enemies_destroyed,
        powerups_collected,
        play_duration,
        created_at
        FROM monad.t_shooting_record a
        where
        a.fid != 0
        ORDER BY score DESC
        LIMIT 10
        `;
 
      // SELECT文を実行してデータを取得
      const result = await pool.query(query);
      return NextResponse.json({ 
        success: true,
        scores: result.rows 
      });
   
    } catch (error) {
      console.error('Error fetching scores:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
   }