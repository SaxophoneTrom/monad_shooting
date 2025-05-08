"use client";

import dynamic from "next/dynamic";
import { APP_NAME } from "~/lib/constants";

// note: dynamic import is required for components that use the Frame SDK
const MAIN = dynamic(() => import('~/components/Shooting'), {
  ssr: false,
});

export default function App(
  { title }: { title?: string } = { title: APP_NAME }
) {
  return (
    <main className="min-h-screen flex flex-col p-4">
      <MAIN />
    </main>
  );
}
