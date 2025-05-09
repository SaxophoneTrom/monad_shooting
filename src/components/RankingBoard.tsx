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

      const url = process.env.APP_URL || "https://moxie-shooting-v2.vercel.app/";
      //const url = "https://moxie-frame-kit.vercel.app/";
      const inputSentence = sentence + "\n\nFrame by @saxophone55.eth";
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


  return (
    <div className="w-full h-full flex flex-col items-center bg-gray-900 text-white p-4">
      {/* ヘッダー */}
      <div className="text-2xl font-bold mb-6">Ranking</div>

      {/* トップ3 */}
      <div className="w-full flex flex-col gap-4 mb-8">
        {topThree.map((rank, index) => (
          <div 
            key={index}
            className="flex flex-col items-center p-4 rounded-lg"
            style={{
              backgroundColor: index === 0 ? '#FFD700' : 
                             index === 1 ? '#C0C0C0' : 
                             '#CD7F32',
              color: '#000'
            }}
          >
            <div className="text-3xl font-bold mb-2">
              #{index + 1}
            </div>
            <img className="h-14 w-14 rounded-full" src={rank.pfp_url} ></img>
            <div className="text-2xl">
              {rank.display_name}
            </div>
            <div className="text-2xl font-bold mb-1">
              {rank.score.toLocaleString()} pts
            </div>
            <div className="text-sm">
              enemies destroyed: {rank.enemies_destroyed}
            </div>
            <div className="text-xs">
              {new Date(rank.created_at).toLocaleDateString()}
            </div>
            <button className="mt-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
             onClick={() => openFrameIntro("@" + rank.user_name + " get " + rank.score + "pts!")}>Share</button>
          </div>
        ))}
      </div>

      {/* 4位以下 */}
      <div className="w-full">
        <div className="text-lg font-bold mb-2">others</div>
        <div className="flex flex-col gap-2">
          {others.map((rank, index) => (
            <div 
              key={index}
              className="flex justify-between items-center bg-gray-800 p-2 rounded"
            >
              <div className="flex items-center">
                <span className="text-lg font-bold w-8">#{index + 4}</span>
                <span className="text-lg font-bold w-40">{rank.display_name}</span>
                <span className="text-sm">{rank.score.toLocaleString()} pts</span>
              </div>
              <div className="text-sm text-gray-400">
                {new Date(rank.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 戻るボタン */}
      <button
        onClick={onBack}
        className="mt-8 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg
                   transition-colors duration-200"
      >
        back
      </button>
    </div>
  );
};

export default RankingBoard;