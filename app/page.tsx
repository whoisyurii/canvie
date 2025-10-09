import type { Metadata } from "next";

import LandingPage from "./_components/landing-page";

export const dynamic = "error";

export function generateMetadata(): Metadata {
  const title = "Realitea Canvas — Collaborative Whiteboard";
  const description = "Spin up a shared canvas in seconds and sketch ideas with your team in real time.";
  const url = "https://realitea-canvas.app";

  return {
    metadataBase: new URL(url),
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Realitea Canvas",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function Page() {
  return <LandingPage />;
}
