import { NextResponse } from 'next/server';
import pool from '~/lib/db';

export async function GET() {
  try {
    // 今日のハイスコアを取得
    const todayHighScoreQuery = `
      SELECT 
        MAX(score) as today_high_score
      FROM monad.t_shooting_record 
      WHERE 
        DATE(created_at) = CURRENT_DATE
        AND fid != 0
    `;

    // 総プレイヤー数（ユニークなfid数）を取得
    const totalPlayersQuery = `
      SELECT 
        COUNT(DISTINCT fid) as total_players
      FROM monad.t_shooting_record 
      WHERE fid != 0
    `;

    // 総プレイ回数を取得
    const totalPlaysQuery = `
      SELECT 
        COUNT(*) as total_plays
      FROM monad.t_shooting_record 
      WHERE fid != 0
    `;
    
    // 全てのクエリを並行実行
    const [todayResult, totalResult, playsResult] = await Promise.all([
      pool.query(todayHighScoreQuery),
      pool.query(totalPlayersQuery),
      pool.query(totalPlaysQuery)
    ]);

    const todayHighScore = todayResult.rows[0]?.today_high_score || 0;
    const totalPlayers = totalResult.rows[0]?.total_players || 0;
    const totalPlays = playsResult.rows[0]?.total_plays || 0;

    return NextResponse.json({
      success: true,
      stats: {
        todayHighScore: parseInt(todayHighScore),
        totalPlayers: parseInt(totalPlayers),
        totalPlays: parseInt(totalPlays)
      }
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 