import sdk from "@farcaster/frame-sdk";
import { useCallback } from "react";

export interface RankingData {
  rank: number;
  score: number;
  enemies_destroyed: number;
  play_duration: number;
  created_at: string;
  fid:number,
  user_name:string,
  display_name:string,
  pfp_url:string,
}

interface RankingBoardProps {
  rankings: RankingData[];
  onBack: () => void;
}

const RankingBoard: React.FC<RankingBoardProps> = ({ rankings = [], onBack }) => {
    const openFrameIntro = useCallback((sentence:string) => {

      const url = process.env.NEXT_PUBLIC_URL || "https://monad-shooting.vercel.app/";
      //const url = "https://moxie-frame-kit.vercel.app/";
      const inputSentence = sentence + "\n\nMini App by @saxophone55.eth";
      const shareUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(inputSentence)}&embeds%5B%5D=${encodeURIComponent(url)}`
      sdk.actions.openUrl(shareUrl);
  }, []);
    
  // データが空の場合のフォールバック表示
  if (rankings.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center bg-gray-900 text-white p-4">
        <div className="text-2xl font-bold mb-6">Ranking</div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-lg text-gray-400">
            No Data
          </div>
        </div>
        <button
          onClick={onBack}
          className="mt-8 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg
                     transition-colors duration-200"
        >
          back
        </button>
      </div>
    );
  }

  const topThree = rankings.slice(0, 3);
  const others = rankings.slice(3, 10);

  // 表彰台のためのランキングを並び替え（2位、1位、3位の順）
  const podiumOrder = [
    topThree[1], // 2位
    topThree[0], // 1位
    topThree[2]  // 3位
  ].filter(Boolean);

  return (
    <div className="w-full h-full flex flex-col items-center bg-gray-900 text-white p-4 overflow-y-auto">
      {/* ヘッダー */}
      <div className="text-2xl font-bold">Ranking</div>
      {/* 戻るボタン */}
      <button
        onClick={onBack}
        className="mt-1 mb-4 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg
                   transition-colors duration-200"
      >
        back
      </button>

      {/* 表彰台風トップ3 */}
      <div className="w-full flex justify-center items-end gap-2 mb-6" style={{ height: '260px' }}>
        {podiumOrder.map((rank, index) => {
          if (!rank) return null;
          
          const position = index === 1 ? 1 : index === 0 ? 2 : 3; // 実際の順位
          const isFirst = position === 1;
          const isSecond = position === 2;
          const isThird = position === 3;
          
          return (
            <div 
              key={position}
              className="flex flex-col items-center justify-end"
              style={{
                height: isFirst ? '240px' : isSecond ? '190px' : '150px',
                width: isFirst ? '120px' : '100px'
              }}
            >
              {/* プロフィール画像 */}
              <img 
                className={`rounded-full mb-2 ${isFirst ? 'h-16 w-16' : 'h-12 w-12'}`} 
                src={rank.pfp_url}
                alt={rank.user_name}
              />
              
              {/* 名前 */}
              <div className={`font-bold mb-1 text-center ${isFirst ? 'text-lg' : 'text-sm'}`}>
                {rank.user_name}
              </div>
              
              {/* スコア */}
              <div className={`font-bold mb-2 text-center ${isFirst ? 'text-xl' : 'text-lg'}`}>
                {rank.score.toLocaleString()} pts
              </div>
              
              {/* 表彰台 */}
              <div 
                className="w-full flex flex-col items-center justify-center rounded-t-lg"
                style={{
                  backgroundColor: isFirst ? '#FFD700' : isSecond ? '#C0C0C0' : '#CD7F32',
                  height: isFirst ? '140px' : isSecond ? '100px' : '70px'
                }}
              >
                {/* ランク番号 */}
                <div className={`font-bold text-black ${isFirst ? 'text-4xl' : 'text-3xl'} mb-1`}>
                  #{position}
                </div>
                
                {/* 追加情報 */}
                <div className="text-xs text-black mb-1">
                destroyed: {rank.enemies_destroyed}
                </div>
                <div className="text-xs text-black">
                  {new Date(rank.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4位以下 */}
      {others.length > 0 && (
        <div className="w-full mb-4">
          <div className="text-lg font-bold mb-2">others</div>
          <div className="flex flex-col gap-2">
            {others.map((rank, index) => (
              <div 
                key={index}
                className="flex justify-between items-center bg-gray-800 p-2 rounded"
              >
                <div className="flex items-center">
                  <span className="text-lg font-bold w-8">#{index + 4}</span>
                  <span className="text-lg font-bold w-40">{rank.user_name}</span>
                  <span className="text-sm">{rank.score.toLocaleString()} pts</span>
                </div>
                <div className="text-sm text-gray-400">
                  {new Date(rank.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 戻るボタン */}
      <button
        onClick={onBack}
        className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg
                   transition-colors duration-200 mb-4"
      >
        back
      </button>
    </div>
  );
};

export default RankingBoard;