import { StockDetailClient } from './StockDetailClient';

interface StockPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: StockPageProps) {
  const ticker = decodeURIComponent(params.ticker);
  return {
    title: `${ticker} - Ra'd AI`,
    description: `Stock details and analysis for ${ticker}`,
  };
}

export default function StockPage({ params }: StockPageProps) {
  const ticker = decodeURIComponent(params.ticker);
  return <StockDetailClient ticker={ticker} />;
}
