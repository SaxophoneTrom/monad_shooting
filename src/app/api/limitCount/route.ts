// app/api/limitCount/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import pool from '~/lib/db';

interface PlayCount {
  fid: string;
  play_count: number;
  last_played: Date;
  created_at: Date;
}

interface LimitConfig {
  daily_limit: number;
  reset_hour: number;  // 0-23の値で、プレイ回数をリセットする時刻
}

// プレイ回数の制限設定
const LIMIT_CONFIG: LimitConfig = {
  daily_limit: 0,     // 1日のプレイ制限回数
  reset_hour: 0       // 深夜0時にリセット
};

// 現在のプレイ回数を取得・更新する関数
async function getPlayCount(fid: string): Promise<PlayCount | null> {
  try {
    const query = `
    select fid, count(*) as play_count, max(created_at) as last_played, min(created_at) as created_at
    from monad.t_shooting_record
    where fid != 0 and DATE(created_at) = DATE(NOW() AT TIME ZONE 'UTC')
    and fid = $1
    group by fid;
    `;
    // SELECT文を実行してデータを取得
    const result = await pool.query(query,[fid]);

    if (result.rows.length > 0) {
      return result.rows[0] as PlayCount;
    }
    return null; 

  } catch (error) {
    console.error('Error getting play count:', error);
    return null;
  }
}

// 追加プレイができるかどうか
async function getAddLimitCount(fid: string): Promise<number | null> {
  try {
    const frameUsedPool = new Pool({
      connectionString: process.env.USING_RECORD_DATABASE_URL, // 環境変数からURLを取得
    });

    const query = `
select
count(*) as frame_using_count
from
(
select
fid,
application_name
from
frame_using.t_record_frame_using
where
fid = $1
and
DATE(created_at) = DATE(NOW() AT TIME ZONE 'UTC')
group by
fid,application_name
);
    `;
    // SELECT文を実行してデータを取得
    const result = await frameUsedPool.query(query,[fid]);

    if (result.rows.length > 0) {
      return result.rows[0].frame_using_count as number;
    }
    return null; 

  } catch (error) {
    console.error('Error getting play count:', error);
    return null;
  }
}

// プレイ回数をリセットするべきか判断
function shouldResetCount(lastPlayed: Date): boolean {
  const now = new Date();
  const resetTime = new Date();
  resetTime.setHours(LIMIT_CONFIG.reset_hour, 0, 0, 0);

  // 最後のプレイが前日以前で、現在時刻がリセット時刻を過ぎている場合
  return lastPlayed.getDate() < now.getDate() && now >= resetTime;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fid = searchParams.get('fid');

    console.log(fid);
    // fidが存在しない場合はエラーレスポンスを返す
    if (!fid) {
      return NextResponse.json({
        success: true,
        limit: LIMIT_CONFIG.daily_limit,
        currentCount: 0,
        resetHour: LIMIT_CONFIG.reset_hour
      });
    }



    let playCount = await getPlayCount(fid);
    let limitCount = LIMIT_CONFIG.daily_limit;

/*     let addLimitCount = await getAddLimitCount(fid);
    if(addLimitCount){
      limitCount = limitCount + Number(addLimitCount);
    }
 */
    if(fid === "415368"){
      limitCount = 0;
    }


    if(!playCount){
        return NextResponse.json({
            success: true,
            limit: limitCount,
            currentCount: 0,
            resetHour: LIMIT_CONFIG.reset_hour
          });
    }

    return NextResponse.json({
      success: true,
      limit: limitCount,
      currentCount: playCount.play_count,
      resetHour: LIMIT_CONFIG.reset_hour
    });

  } catch (error) {
    console.error('Error in limitCount API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
