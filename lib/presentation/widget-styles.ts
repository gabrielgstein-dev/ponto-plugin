import { generateCSSVariables } from '../domain/theme-utils';

export function generateWidgetStyles(): string {
  const cssVars = generateCSSVariables();
  
  return `
    <style>
      :root {
        ${cssVars}
      }
      /* Dark mode support for widget */
      .dark #senior-ponto-widget {
        --bg: var(--dark-bg);
        --surface: var(--dark-surface);
        --surface2: var(--dark-surface2);
        --border: var(--dark-border);
        --accent: var(--dark-accent);
        --accent2: var(--dark-accent2);
        --warn: var(--dark-warn);
        --danger: var(--dark-danger);
        --text: var(--dark-text);
        --text-dim: var(--dark-text-dim);
        --text-dimmer: var(--dark-text-dimmer);
      }
      
      #senior-ponto-widget { position:fixed; bottom:20px; right:20px; z-index:99999; font-family:var(--sans); user-select:none; will-change:transform; }
      #senior-ponto-widget.spw-dragging { transition:none !important; }
      #spw-toggle { touch-action:none; }
      #spw-toggle { width:48px; height:48px; background:var(--bg); border:2px solid var(--accent); border-radius:50%; cursor:grab; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(74,222,128,0.3); margin-left:auto; transition:all 0.2s ease; }
      #spw-toggle:active { cursor:grabbing; }
      #spw-toggle:hover { transform:scale(1.05); box-shadow:0 4px 24px rgba(74,222,128,0.5); }
      #spw-toggle svg { color:var(--accent); transition:color 0.2s ease; }
      #spw-panel { display:none; position:absolute; background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:14px; width:220px; box-shadow:0 8px 32px rgba(0,0,0,0.5); transition:all 0.2s ease; }
      #spw-panel.open { display:block; }
      .spw-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-dimmer); margin-bottom:10px; transition:color 0.2s ease; }
      .spw-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding:4px 0; border-bottom:1px solid var(--surface2); transition:border-color 0.2s ease; }
      .spw-row:last-child { border-bottom:none; margin-bottom:0; }
      .spw-label { font-size:10px; color:var(--text-dim); transition:color 0.2s ease; }
      .spw-time { font-size:14px; font-weight:700; font-family:var(--mono); color:var(--text); transition:color 0.2s ease; }
      .spw-time.calc { color:var(--warn); font-size:12px; transition:color 0.2s ease; }
      .spw-time.past { color:var(--accent); transition:color 0.2s ease; }
      .spw-time.next { color:var(--accent2); transition:color 0.2s ease; }
      .spw-clock { text-align:center; font-size:20px; font-weight:700; font-family:var(--mono); color:var(--text); margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--border); transition:all 0.2s ease; }
    </style>
  `;
}
