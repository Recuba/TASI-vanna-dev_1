declare module 'react-plotly.js' {
  import { Component } from 'react';

  interface PlotParams {
    data: Plotly.Data[];
    layout?: Partial<Plotly.Layout>;
    config?: Partial<Plotly.Config>;
    style?: React.CSSProperties;
    className?: string;
    useResizeHandler?: boolean;
    onInitialized?: (figure: Readonly<{ data: Plotly.Data[]; layout: Partial<Plotly.Layout> }>, graphDiv: HTMLElement) => void;
    onUpdate?: (figure: Readonly<{ data: Plotly.Data[]; layout: Partial<Plotly.Layout> }>, graphDiv: HTMLElement) => void;
  }

  export default class Plot extends Component<PlotParams> {}
}

declare namespace Plotly {
  interface Data {
    [key: string]: unknown;
    type?: string;
    x?: unknown[];
    y?: unknown[];
    name?: string;
  }

  interface Layout {
    [key: string]: unknown;
    title?: string | { text: string };
    paper_bgcolor?: string;
    plot_bgcolor?: string;
    font?: { color?: string; family?: string; size?: number };
    margin?: { t?: number; r?: number; b?: number; l?: number };
    xaxis?: Record<string, unknown>;
    yaxis?: Record<string, unknown>;
  }

  interface Config {
    responsive?: boolean;
    displayModeBar?: boolean;
    modeBarButtonsToRemove?: string[];
    displaylogo?: boolean;
  }
}
