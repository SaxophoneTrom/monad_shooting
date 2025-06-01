import { createConfig, http, WagmiProvider } from "wagmi";
import { base, degen, mainnet, optimism, unichain } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import React from "react";
import { monadTestnet } from "wagmi/chains";


export const config = createConfig({
  chains: [base, monadTestnet],
  transports: {
    [base.id]: http(),
    [monadTestnet.id]: http(),
  },
  connectors: [
    farcasterFrame(),
  ],
});

const queryClient = new QueryClient();


export default function Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
