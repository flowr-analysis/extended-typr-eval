import { EvalDataHistory } from "./database";

/**
 * Creates a bar plot from x- and y-labels and data points.
 * For each `x`, one column is created, consisting of `data[x]`, with height `sum(data[x])`.
 * The value `data[x][y]` belongs to the labels `x[x]` and `y[y]` and is a block of a bar.
 */
export function pgfplot_blockbars(x: string[], y: string[], data: number[][]): string {
  // adapted from: https://pgfplots.net/market-by-sector/, CC BY-SA 4.0, by user Eya Tellili
  // FIXME: CC BY-SA 4.0 requires Share-Alike, so at least `plots.ts` must be licensed
  // as CC BY-SA 4.0 (or GPLv3...). TODO: find out how to do this properly, and do it; probably
  // licensing (parts of) this project as CC BY-SA 4.0 and adding a disclaimer to the README.md and thesis?
  let plots = "";
  for (let j = 0; j < y.length; j++) {
    plots += "\n    \\addplot coordinates {";
    for (let i = 0; i < x.length; i++) {
      let point = data[i][j];
      plots += ` (${x[i]},${point})`;
    }
    plots += " };";
  }
  // \addplot[fill=blue!80] coordinates {(2010,2.3) (2015,2.8) (2018,3)
  //   (2019,3.2) (2020,2.9) (2021,3.3) (2022,3.3) (2023,3.3) (2024,3.4)
  //   (2025,3.5) (2026,3.5) (2027,3.6)};
  // \addplot[fill=cyan!60] coordinates {(2010,2.3) (2015,2.9) (2018,3.2)
  //   (2019,3.3) (2020,2.7) (2021,2.8) (2022,3) (2023,3.1) (2024,3.2)
  //   (2025,3.4) (2026,3.5) (2027,3.7)};
  // \addplot[fill=magenta!70] coordinates {(2010,1.5) (2015,1.7)
  //   (2018,1.8) (2019,1.9) (2020,1.9) (2021,2) (2022,2.2) (2023,2.2)
  //   (2024,2.3) (2025,2.4) (2026,2.5) (2027,2.6)};
  // \addplot[fill=yellow!80] coordinates {(2010,0.8) (2015,1) (2018,1.4)
  //   (2019,1.2) (2020,2.4) (2021,2.6) (2022,1.7) (2023,1.8) (2024,1.9)
  //   (2025,2) (2026,2) (2027,2.1)};
  // \addplot[fill=red!80] coordinates {(2010,0.7) (2015,0.8) (2018,0.9)
  //   (2019,0.9) (2020,0.9) (2021,1) (2022,1) (2023,1.1) (2024,1.1)
  //   (2025,1.2) (2026,1.2) (2027,1.3)};
  // \addplot[fill=orange!80] coordinates {(2010,0.2) (2015,0.4)
  //   (2018,0.3) (2019,0.4) (2020,0.4) (2021,0.3) (2022,0.3)
  //   (2023,0.5) (2024,0.5) (2025,0.3) (2026,0.6) (2027,0.5)};
  // \addplot[fill=gray!70] coordinates {(2010,0.7) (2015,0.8) (2018,0.8)
  //   (2019,0.9) (2020,1) (2021,1.1) (2022,1.2) (2023,1.2) (2024,1.2)
  //   (2025,1.3) (2026,1.3) (2027,1.3)};
  return `\\begin{tikzpicture}
  \\begin{axis}[
    ybar stacked,
    symbolic x coords = { ${x.map(l => l.replaceAll(", ", " ").replaceAll(",", " ")).join(", ")} },
    xtick = data,
    xticklabel style = {rotate = 45, anchor = east, yshift = -5pt},
    ymin = 0, ymax = ${Math.ceil(1+data.flatMap(col => col).reduce((a, n) => a + n))},
    legend style = {
      at = {(0.5, -0.2)}, 
      anchor = north, 
      legend columns = 4,
      /tikz/every even column/.append style = {column sep = 2.5em}
    },
    width = 15cm, height = 9cm,
    bar width = 14pt,
    nodes near coords, nodes near coords align = {vertical},
    every node near coord/.style = {
      font   = \\tiny,
      color  = black,
      yshift = 4pt
    }
  ]${plots}
    \\legend{ ${y.map(l => l.replaceAll(", ", " ").replaceAll(",", " ")).join(", ")} }
  \\end{axis}
\\end{tikzpicture}`;
}
